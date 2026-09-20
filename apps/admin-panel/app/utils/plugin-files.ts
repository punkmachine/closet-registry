import {
  PLUGIN_AI_VALUES,
  PLUGIN_COMPONENTS,
  type PluginAi,
  type PluginBundleFile,
  type PluginComponent,
  type PluginFileInput,
  type PluginPublishMetadata,
} from "~~/shared/types/registry";

/** Один файл в форме публикации/редактирования. */
export interface FormFile {
  /** Локальный идентификатор строки в форме, в запрос не уходит. */
  id: string;
  relativePath: string;
  component: PluginComponent;
  ai: PluginAi | null;
  rootPath: boolean;
  merge: boolean;
  mergeKeyPath: string;
  template: boolean;
  /**
   * Текстовые файлы можно править прямо в форме; бинарные (не декодируемые как UTF-8)
   * держим как байты и заменяем только загрузкой нового файла.
   */
  kind: "text" | "binary";
  text: string;
  bytes: Uint8Array | null;
  sizeBytes: number;
}

let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `f${idCounter}`;
}

const COMPONENT_SET = new Set<string>(PLUGIN_COMPONENTS);
const AI_SET = new Set<string>(PLUGIN_AI_VALUES);

/** Синонимы каталогов, которыми реально называют компоненты в проектах Claude Code / Codex. */
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

const AI_ALIASES: Record<string, PluginAi> = {
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
  ai: PluginAi | null;
  relativePath: string;
} {
  const segments = splitPath(rawPath);
  const fileName = segments.at(-1) ?? rawPath;

  let component: PluginComponent | null = null;
  let ai: PluginAi | null = null;
  const rest: string[] = [];

  for (const [index, segment] of segments.entries()) {
    const isLast = index === segments.length - 1;
    const key = segment.toLowerCase();

    if (!isLast && component === null && COMPONENT_ALIASES[key]) {
      component = COMPONENT_ALIASES[key];
      continue;
    }
    if (!isLast && ai === null && AI_ALIASES[key]) {
      ai = AI_ALIASES[key];
      continue;
    }
    rest.push(segment);
  }

  if (component === null) {
    component = guessComponentByFileName(fileName);
  }

  return { component, ai, relativePath: rest.join("/") || fileName };
}

function guessComponentByFileName(fileName: string): PluginComponent {
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
  // .md без иных признаков — правило/памятка: самый частый и самый безобидный дефолт.
  return "rules";
}

/** Подсказка mergeKeyPath: слот именуется по файлу, чтобы плагины не перетирали друг друга. */
export function suggestMergeKeyPath(component: PluginComponent, relativePath: string): string {
  const base = (relativePath.split(/[\\/]/).at(-1) ?? relativePath).replace(/\.[^.]+$/, "");
  const slotName = base.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "closet";

  switch (component) {
    case "mcp":
      return `mcpServers.${slotName}`;
    case "hooks":
      return "hooks.PostToolUse[]";
    default:
      return slotName;
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
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Строка формы из локального файла (drag&drop или file input). */
export async function formFileFromBrowserFile(file: File): Promise<FormFile> {
  // webkitRelativePath заполнен при выборе целой папки — тогда component/ai видны из пути.
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
  };
}

/** Строка формы из файла, уже лежащего в реестре (ответ bundle-эндпоинта). */
export function formFileFromBundleFile(file: PluginBundleFile): FormFile {
  const isText = file.encoding === "utf8";

  return {
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
  };
}

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
  };
}

/**
 * Имя multipart-поля, по которому реестр сопоставляет содержимое с метаданными:
 * `component::ai::relativePath`, где пустой ai == общий для всех ИИ файл
 * (см. buildFileKey в routes/admin-plugins.ts).
 */
function multipartFieldName(file: FormFile): string {
  return `${file.component}::${file.ai ?? ""}::${file.relativePath}`;
}

export interface PluginFormValues {
  slug: string;
  description: string;
  version: string;
  changelog: string;
  dependencies: string[];
  files: FormFile[];
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
    if (!file.relativePath.trim()) {
      errors.push("У каждого файла должен быть путь");
      continue;
    }
    if (file.relativePath.startsWith("/") || file.relativePath.includes("..")) {
      errors.push(`${file.relativePath}: путь не может быть абсолютным или содержать ".."`);
    }
    if (file.merge && !file.mergeKeyPath.trim()) {
      errors.push(`${file.relativePath}: для merge-файла обязателен mergeKeyPath`);
    }

    const key = multipartFieldName(file);
    if (seen.has(key)) {
      errors.push(`Дубль файла: ${file.component}/${file.ai ?? "общий"}/${file.relativePath}`);
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
    relativePath: file.relativePath,
    rootPath: file.rootPath,
    merge: file.merge,
    template: file.template,
    ...(file.merge ? { mergeKeyPath: file.mergeKeyPath.trim() } : {}),
  }));

  const metadata: PluginPublishMetadata = {
    slug: values.slug,
    description: values.description,
    version: values.version,
    dependencies: values.dependencies,
    files,
    ...(values.changelog.trim() ? { changelog: values.changelog.trim() } : {}),
  };

  const formData = new FormData();
  formData.append("metadata", JSON.stringify(metadata));

  for (const file of values.files) {
    const payload: BlobPart = file.kind === "binary" && file.bytes ? file.bytes : file.text;
    const fileName = file.relativePath.split("/").at(-1) || "file";
    formData.append(multipartFieldName(file), new Blob([payload]), fileName);
  }

  return formData;
}

export { COMPONENT_SET, AI_SET };
