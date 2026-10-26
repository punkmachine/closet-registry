import {
  HARNESS_IDS,
  type HarnessId,
  isHarnessSupported,
  PLUGIN_COMPONENTS,
  PLUGIN_FILE_AI_VALUES,
  type PluginBundleFile,
  type PluginComponent,
  type PluginFileAi,
  type PluginFileFormat,
  type PluginFileInput,
  type PluginPublishMetadata,
  type PluginSourceFile,
} from "@closet/contract";
import {
  draftToText,
  emptyDraft,
  importAgentMarkdown,
  parseSpec,
  type RenderedFile,
  renderSpec,
  type SpecDraft,
  SpecError,
  textToDraft,
} from "@closet/harness-render";

export interface FormFile {
  id: string;
  relativePath: string;
  component: PluginComponent;
  ai: PluginFileAi | null;
  rootPath: boolean;
  merge: boolean;
  mergeKeyPath: string;
  template: boolean;
  kind: "text" | "binary";
  text: string;
  bytes: Uint8Array | null;
  sizeBytes: number;
  /** `spec` — нейтральный источник, из которого реестр генерирует файлы под `targets`. */
  format: PluginFileFormat;
  targets: HarnessId[];
  /** Поля формы «универсальный элемент»; `null` у raw и у spec, который не разобрался (тогда правится `text`). */
  draft: SpecDraft | null;
}

/** Поля raw-файла; функция, а не константа, чтобы у строк не было общего массива `targets`. */
function rawFields(): Pick<FormFile, "format" | "targets" | "draft"> {
  return { format: "raw", targets: [], draft: null };
}

let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `f${idCounter}`;
}

const COMPONENT_SET = new Set<string>(PLUGIN_COMPONENTS);
const AI_SET = new Set<string>(PLUGIN_FILE_AI_VALUES);

const COMPONENT_ALIASES: Record<string, PluginComponent> = {
  mcp: "mcp",
  rules: "rules",
  rule: "rules",
  memories: "rules",
  hooks: "hooks",
  hook: "hooks",
  agents: "agents",
  agent: "agents",
  subagents: "agents",
  commands: "commands",
  command: "commands",
  skills: "skills",
  skill: "skills",
  scripts: "scripts",
  script: "scripts",
  bin: "scripts",
};

const AI_ALIASES: Record<string, PluginFileAi> = {
  codex: "codex",
  "claude-code": "claude-code",
  claude: "claude-code",
  ".claude": "claude-code",
  ".codex": "codex",
};

function splitPath(path: string): string[] {
  return path.split(/[\\/]+/).filter((segment) => segment.length > 0 && segment !== ".");
}

/**
 * Определяет component/ai по пути перетащенного файла и возвращает `relativePath` БЕЗ них:
 * на диске реестра файл лежит как `<component>/[<ai>/]<relativePath>`, поэтому оставлять
 * `hooks/` внутри relativePath — значит получить `hooks/hooks/foo.sh`.
 */
export function classifyPath(rawPath: string): {
  component: PluginComponent;
  ai: PluginFileAi | null;
  relativePath: string;
} {
  const segments = splitPath(rawPath);
  const fileName = segments.at(-1) ?? rawPath;

  let component: PluginComponent | null = null;
  let ai: PluginFileAi | null = null;
  const rest: string[] = [];

  for (const [index, segment] of segments.entries()) {
    const isLast = index === segments.length - 1;
    const key = segment.toLowerCase();

    const componentAlias = Object.hasOwn(COMPONENT_ALIASES, key) ? COMPONENT_ALIASES[key] : undefined;
    if (!isLast && component === null && componentAlias) {
      component = componentAlias;
      continue;
    }
    const aiAlias = Object.hasOwn(AI_ALIASES, key) ? AI_ALIASES[key] : undefined;
    if (!isLast && ai === null && aiAlias) {
      ai = aiAlias;
      continue;
    }
    rest.push(segment);
  }

  component ??= guessComponentByFileName(fileName);

  return { component, ai, relativePath: rest.join("/") || fileName };
}

/**
 * Определяет компонент плагина по имени файла.
 */
export function guessComponentByFileName(fileName: string): PluginComponent {
  const lower = fileName.toLowerCase();

  if (lower === "mcp.json" || lower === ".mcp.json" || lower.endsWith(".mcp.json")) {
    return "mcp";
  }
  if (lower.endsWith(".sh") || lower.endsWith(".py") || lower.endsWith(".mjs") || lower.endsWith(".js")) {
    return "scripts";
  }
  if (lower === "settings.json" || lower.includes("hook")) {
    return "hooks";
  }
  /** .md без иных признаков — правило/памятка: самый частый и самый безобидный дефолт. */
  return "rules";
}

/** Подсказка mergeKeyPath: слот именуется по файлу, чтобы плагины не перетирали друг друга. */
export function suggestMergeKeyPath(component: PluginComponent, relativePath: string): string {
  const base = (relativePath.split(/[\\/]/).at(-1) ?? relativePath).replace(/\.[^.]+$/, "");
  const slotName = base.replaceAll(/[^a-zA-Z0-9_-]+/g, "-").replaceAll(/^-+|-+$/g, "") || "closet";

  switch (component) {
    case "mcp": {
      return `mcpServers.${slotName}`;
    }
    case "hooks": {
      return "hooks.PostToolUse[]";
    }
    default: {
      return slotName;
    }
  }
}

/** Декодирует байты как UTF-8; null — значит файл бинарный и править его текстом нельзя. */
function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.codePointAt(i) ?? 0;
  }
  return bytes;
}

/** Строка формы из локального файла (drag&drop или file input). */
export async function formFileFromBrowserFile(file: File): Promise<FormFile> {
  /** webkitRelativePath заполнен при выборе целой папки — тогда component/ai видны из пути. */
  const rawPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  const { component, ai, relativePath } = classifyPath(rawPath);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = decodeUtf8(bytes);

  return {
    id: nextId(),
    relativePath,
    component,
    ai,
    rootPath: false,
    merge: false,
    mergeKeyPath: "",
    template: false,
    kind: text === null ? "binary" : "text",
    text: text ?? "",
    bytes: text === null ? bytes : null,
    sizeBytes: bytes.byteLength,
    ...rawFields(),
  };
}

/** Строка формы из файла, уже лежащего в реестре (bundle или исходники версии). */
export function formFileFromBundleFile(file: PluginBundleFile | PluginSourceFile): FormFile {
  const isText = file.encoding === "utf8";
  const base: FormFile = {
    id: nextId(),
    relativePath: file.relativePath,
    component: file.component,
    ai: file.ai,
    rootPath: file.rootPath,
    merge: file.merge,
    mergeKeyPath: file.mergeKeyPath ?? "",
    template: file.template,
    kind: isText ? "text" : "binary",
    text: isText ? file.content : "",
    bytes: isText ? null : base64ToBytes(file.content),
    sizeBytes: Number(file.sizeBytes) || 0,
    ...rawFields(),
  };

  return "format" in file && file.format === "spec"
    ? { ...base, format: "spec", targets: file.targets ?? [], draft: tryTextToDraft(base.text) }
    : base;
}

/** Разбирает spec в черновик; `null`, если не разобрался — форма тогда покажет исходный текст как есть. */
function tryTextToDraft(text: string): SpecDraft | null {
  try {
    return textToDraft(text);
  } catch (error) {
    if (error instanceof SpecError) {
      return null;
    }

    throw error;
  }
}

/** Цели по умолчанию для нового универсального элемента: все harness'ы, поддерживающие компонент. */
export function defaultTargets(component: PluginComponent): HarnessId[] {
  return HARNESS_IDS.filter((harness) => isHarnessSupported(component, harness));
}

/** Новая строка «универсальный элемент» (пока только агент) с пустым черновиком. */
export function emptySpecFormFile(): FormFile {
  return {
    id: nextId(),
    relativePath: "",
    component: "agents",
    ai: null,
    rootPath: false,
    merge: false,
    mergeKeyPath: "",
    template: false,
    kind: "text",
    text: "",
    bytes: null,
    sizeBytes: 0,
    format: "spec",
    targets: defaultTargets("agents"),
    draft: emptyDraft(),
  };
}

/**
 * Превращает обычный файл агента (`.claude/agents/*.md`) в универсальный элемент.
 *
 * @throws {SpecError} если у файла нет валидного frontmatter
 */
export function importAsSpecFile(file: FormFile): FormFile {
  const fileName = (file.relativePath.split("/").at(-1) ?? "").replace(/\.[^.]+$/, "");

  return {
    ...file,
    component: "agents",
    ai: null,
    relativePath: "",
    rootPath: false,
    merge: false,
    template: false,
    format: "spec",
    targets: defaultTargets("agents"),
    draft: importAgentMarkdown(file.text, fileName),
  };
}

/** Путь файла в плагине; у универсального элемента он выводится из имени (`<name>.md`). */
export function fileRelativePath(file: FormFile): string {
  return file.format === "spec" && file.draft ? `${file.draft.name.trim()}.md` : file.relativePath;
}

/**
 * Содержимое файла, которое уйдёт в реестр.
 *
 * @throws {SpecError} если поля универсального элемента не собираются в валидный spec
 */
export function fileText(file: FormFile): string {
  return file.format === "spec" && file.draft ? draftToText(file.draft) : file.text;
}

export interface SpecPreview {
  harness: HarnessId;
  rendered: RenderedFile | null;
  error: string | null;
}

/** Что получится для каждой выбранной цели; ошибка рендера не роняет форму, а показывается в превью. */
export function previewSpec(file: FormFile): SpecPreview[] {
  let spec: ReturnType<typeof parseSpec>;

  try {
    spec = parseSpec(fileText(file));
  } catch (error) {
    if (!(error instanceof SpecError)) {
      throw error;
    }

    return file.targets.map((harness) => ({ harness, rendered: null, error: error.message }));
  }

  return file.targets.map((harness) => {
    try {
      return { harness, rendered: renderSpec(spec, harness), error: null };
    } catch (error) {
      if (!(error instanceof SpecError)) {
        throw error;
      }

      return { harness, rendered: null, error: error.message };
    }
  });
}

/** Raw-файл под конкретный harness с содержимым, которое сгенерировал бы реестр: стартовая точка для override. */
export function overrideFileFor(rendered: RenderedFile, harness: HarnessId): FormFile {
  return {
    ...emptyTextFormFile(),
    component: "agents",
    ai: harness,
    relativePath: rendered.relativePath,
    text: rendered.content,
    sizeBytes: rendered.content.length,
  };
}

/**
 * Создаёт пустую строку формы файла плагина с новым id.
 */
export function emptyTextFormFile(): FormFile {
  return {
    id: nextId(),
    relativePath: "",
    component: "rules",
    ai: null,
    rootPath: false,
    merge: false,
    mergeKeyPath: "",
    template: false,
    kind: "text",
    text: "",
    bytes: null,
    sizeBytes: 0,
    ...rawFields(),
  };
}

/**
 * Имя multipart-поля, по которому реестр сопоставляет содержимое с метаданными:
 * `component::ai::relativePath`, где пустой ai == общий для всех ИИ файл
 * (см. buildFileKey в routes/admin-plugins.ts).
 */
function multipartFieldName(file: FormFile): string {
  return `${file.component}::${file.ai ?? ""}::${fileRelativePath(file)}`;
}

export interface PluginFormValues {
  slug: string;
  description: string;
  version: string;
  changelog: string;
  dependencies: string[];
  files: FormFile[];
}

/** Проверки универсального элемента: цели и то, что поля собираются в валидный spec. */
function validateSpecFile(file: FormFile): string[] {
  const errors: string[] = [];
  const title = file.draft?.name.trim() || "универсальный элемент";

  if (file.targets.length === 0) {
    errors.push(`${title}: выберите хотя бы одну цель`);
  }
  for (const target of file.targets) {
    if (!isHarnessSupported(file.component, target)) {
      errors.push(`${title}: компонент ${file.component} не поддерживается для ${target}`);
    }
  }

  try {
    parseSpec(fileText(file));
  } catch (error) {
    if (!(error instanceof SpecError)) {
      throw error;
    }
    errors.push(`${title}: ${error.message}`);
  }

  return errors;
}

/** Валидация до отправки: сообщения те же, что вернул бы реестр, но без сетевого раунда. */
export function validateForm(values: PluginFormValues, options: { requireSlug: boolean }): string[] {
  const errors: string[] = [];

  if (options.requireSlug && !/^[a-z0-9][a-z0-9-]*$/.test(values.slug)) {
    errors.push("slug: только строчные латинские буквы, цифры и дефис");
  }
  if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(values.version)) {
    errors.push("version: должна быть валидной semver-версией, например 1.0.0");
  }
  if (values.files.length === 0) {
    errors.push("Нужен хотя бы один файл");
  }

  const seen = new Set<string>();
  for (const file of values.files) {
    const relativePath = fileRelativePath(file);

    if (file.format === "spec") {
      errors.push(...validateSpecFile(file));
    } else if (!relativePath.trim()) {
      errors.push("У каждого файла должен быть путь");
      continue;
    }
    if (relativePath.startsWith("/") || relativePath.includes("..")) {
      errors.push(`${relativePath}: путь не может быть абсолютным или содержать ".."`);
    }
    if (file.merge && !file.mergeKeyPath.trim()) {
      errors.push(`${relativePath}: для merge-файла обязателен mergeKeyPath`);
    }

    const key = multipartFieldName(file);
    if (seen.has(key)) {
      errors.push(`Дубль файла: ${file.component}/${file.ai ?? "общий"}/${relativePath}`);
    }
    seen.add(key);
  }

  return [...new Set(errors)];
}

/** Собирает multipart-тело: поле `metadata` с JSON + по одной части на каждый файл. */
export function buildFormData(values: PluginFormValues): FormData {
  const files: PluginFileInput[] = values.files.map((file) => ({
    component: file.component,
    ai: file.ai,
    relativePath: fileRelativePath(file),
    rootPath: file.rootPath,
    merge: file.merge,
    template: file.template,
    format: file.format,
    ...(file.format === "spec" && { targets: file.targets }),
    ...(file.merge && { mergeKeyPath: file.mergeKeyPath.trim() }),
  }));

  const metadata: PluginPublishMetadata = {
    slug: values.slug,
    description: values.description,
    version: values.version,
    dependencies: values.dependencies,
    files,
    ...(values.changelog.trim() && { changelog: values.changelog.trim() }),
  };

  const formData = new FormData();
  formData.append("metadata", JSON.stringify(metadata));

  for (const file of values.files) {
    const payload: BlobPart = file.kind === "binary" && file.bytes ? new Uint8Array(file.bytes) : fileText(file);
    const fileName = fileRelativePath(file).split("/").at(-1) || "file";
    formData.append(multipartFieldName(file), new Blob([payload]), fileName);
  }

  return formData;
}

export { AI_SET, COMPONENT_SET };
