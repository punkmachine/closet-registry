<script setup lang="ts">
import {
  HARNESS_IDS,
  type HarnessId,
  isHarnessSupported,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_VERSION,
  PLUGIN_COMPONENTS,
  PLUGIN_FILE_AI_VALUES,
  type PluginBundle,
  type PluginFileAi,
  type PluginListItem,
  type PluginSource,
} from "@closet/contract";
import { SpecError } from "@closet/harness-render";
import { ComponentBadge, formatBytes } from "@closet/ui";
import {
  emptySpecFormFile,
  emptyTextFormFile,
  type FormFile,
  fileRelativePath,
  formFileFromBrowserFile,
  formFileFromBundleFile,
  importAsSpecFile,
  overrideFileFor,
  type PluginFormValues,
  previewSpec,
  suggestMergeKeyPath,
  validateForm,
} from "~/utils/plugin-files";

const props = defineProps<{
  mode: "create" | "edit";
  initial?: PluginBundle | PluginSource | null;
  availablePlugins: PluginListItem[];
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  submit: [values: PluginFormValues, publishMode: "replace" | "new"];
}>();

const slug = ref(props.initial?.slug ?? "");
const description = ref(props.initial?.description ?? "");
const version = ref(props.initial?.version ?? "1.0.0");
const changelog = ref(props.initial?.changelog ?? "");
const dependencies = ref<string[]>([...(props.initial?.dependencies ?? [])]);
const files = ref<FormFile[]>((props.initial?.files ?? []).map(formFileFromBundleFile));

/**
 * В режиме редактирования PUT в реестре — full replace той же версии, а POST — публикация новой.
 * Выбор делается явно, потому что перезапись уже установленной пользователями версии и выпуск
 * новой — это совершенно разные по последствиям действия (closet-cli сравнивает версии по semver).
 */
const publishMode = ref<"replace" | "new">("replace");
const originalVersion = props.initial?.version ?? "";

watch(publishMode, (mode) => {
  version.value = mode === "replace" ? originalVersion : bumpPatch(originalVersion);
});

function bumpPatch(input: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(input);

  if (!match) {
    return input;
  }

  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

const expanded = ref<Set<string>>(new Set());

function toggleExpanded(id: string): void {
  const next = new Set(expanded.value);

  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }

  expanded.value = next;
}

/* ---------- добавление файлов ---------- */

const dragOver = ref(false);
const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
const dirInput = useTemplateRef<HTMLInputElement>("dirInput");
const localErrors = ref<string[]>([]);

async function addBrowserFiles(list: FileList | null): Promise<void> {
  if (!list || list.length === 0) {
    return;
  }

  const rejected: string[] = [];
  const accepted: FormFile[] = [];

  for (const file of Array.from(list)) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      rejected.push(`${file.name}: больше 10 MB — реестр такой файл не примет`);
      continue;
    }
    accepted.push(await formFileFromBrowserFile(file));
  }

  const total = files.value.length + accepted.length;
  if (total > MAX_FILES_PER_VERSION) {
    rejected.push(`Слишком много файлов: ${total}, лимит реестра — ${MAX_FILES_PER_VERSION}`);
  } else {
    files.value = [...files.value, ...accepted];
  }

  localErrors.value = rejected;
}

function onDrop(event: DragEvent): void {
  dragOver.value = false;
  void addBrowserFiles(event.dataTransfer?.files ?? null);
}

function addEmptyFile(): void {
  const file = emptyTextFormFile();
  files.value = [...files.value, file];
  expanded.value = new Set([...expanded.value, file.id]);
}

function addSpecFile(): void {
  const file = emptySpecFormFile();
  files.value = [...files.value, file];
  expanded.value = new Set([...expanded.value, file.id]);
}

/** Обычный файл агента -> универсальный элемент: строка заменяется на месте, harness-поля уходят в блок claude-code. */
function importAsSpec(file: FormFile): void {
  try {
    const converted = importAsSpecFile(file);
    files.value = files.value.map((item) => (item.id === file.id ? converted : item));
    localErrors.value = [];
  } catch (error) {
    if (!(error instanceof SpecError)) {
      throw error;
    }
    localErrors.value = [`${file.relativePath}: не удалось импортировать как универсальный элемент — ${error.message}`];
  }
}

function toggleTarget(file: FormFile, harness: HarnessId): void {
  file.targets = file.targets.includes(harness)
    ? file.targets.filter((item) => item !== harness)
    : HARNESS_IDS.filter((id) => id === harness || file.targets.includes(id));
}

/** Вкладка превью выбирается по id строки; если выбранную цель сняли — показываем первую из оставшихся. */
const previewTabs = ref<Record<string, HarnessId>>({});

function activePreviewTab(file: FormFile): HarnessId | undefined {
  const picked = previewTabs.value[file.id];

  return picked && file.targets.includes(picked) ? picked : file.targets[0];
}

function findOverride(harness: HarnessId, relativePath: string): FormFile | undefined {
  return files.value.find(
    (item) =>
      item.format === "raw" &&
      item.component === "agents" &&
      item.ai === harness &&
      fileRelativePath(item) === relativePath,
  );
}

/** Создаёт raw-файл под harness с тем, что сгенерировал бы реестр; реестр отдаст его вместо сгенерированного. */
function overrideWithOwnFile(file: FormFile, harness: HarnessId): void {
  const rendered = previewSpec(file).find((item) => item.harness === harness)?.rendered;

  if (!rendered) {
    return;
  }

  const existing = findOverride(harness, rendered.relativePath);
  const target = existing ?? overrideFileFor(rendered, harness);

  if (!existing) {
    files.value = [...files.value, target];
  }
  expanded.value = new Set([...expanded.value, target.id]);
}

function removeFile(id: string): void {
  files.value = files.value.filter((file) => file.id !== id);
}

/** mergeKeyPath без подсказки — частая причина 400 от реестра, поэтому подставляем при включении merge. */
function onMergeToggle(file: FormFile): void {
  if (file.merge && !file.mergeKeyPath) {
    file.mergeKeyPath = suggestMergeKeyPath(file.component, file.relativePath);
  }
}

function toggleDependency(depSlug: string): void {
  dependencies.value = dependencies.value.includes(depSlug)
    ? dependencies.value.filter((item) => item !== depSlug)
    : [...dependencies.value, depSlug];
}

const dependencyOptions = computed(() => props.availablePlugins.filter((plugin) => plugin.slug !== slug.value.trim()));

/* ---------- отправка ---------- */

const values = computed<PluginFormValues>(() => ({
  slug: slug.value.trim(),
  description: description.value.trim(),
  version: version.value.trim(),
  changelog: changelog.value,
  dependencies: dependencies.value,
  files: files.value,
}));

const validationErrors = computed(() => validateForm(values.value, { requireSlug: props.mode === "create" }));

const touched = ref(false);

function onSubmit(): void {
  touched.value = true;
  if (validationErrors.value.length > 0) {
    return;
  }
  emit("submit", values.value, props.mode === "create" ? "new" : publishMode.value);
}

const totalSize = computed(() => files.value.reduce((sum, file) => sum + (file.bytes?.byteLength ?? file.text.length), 0));
</script>

<template>
  <form class="stack" @submit.prevent="onSubmit">
    <div class="panel">
      <div class="panel__head">
        <h2>Метаданные</h2>
      </div>

      <div class="panel__body stack">
        <div class="form-grid">
          <div class="field">
            <label class="field__label" for="slug">slug</label>
            <input
              id="slug"
              v-model="slug"
              class="input input--mono"
              placeholder="my-plugin"
              :disabled="props.mode === 'edit'"
            />
            <span class="field__hint">
              {{ props.mode === "edit" ? "slug менять нельзя — это идентификатор плагина" : "имя, по которому closet-cli ставит плагин" }}
            </span>
          </div>

          <div class="field">
            <label class="field__label" for="version">версия</label>
            <input
              id="version"
              v-model="version"
              class="input input--mono"
              placeholder="1.0.0"
              :disabled="props.mode === 'edit' && publishMode === 'replace'"
            />
            <span class="field__hint">semver: major.minor.patch</span>
          </div>
        </div>

        <div class="field">
          <label class="field__label" for="description">описание</label>
          <input id="description" v-model="description" class="input" placeholder="Что делает плагин" />
        </div>

        <div class="field">
          <label class="field__label" for="changelog">changelog (необязательно)</label>
          <textarea id="changelog" v-model="changelog" class="textarea" rows="3" placeholder="Что изменилось в этой версии" />
        </div>

        <div v-if="props.mode === 'edit'" class="field">
          <span class="field__label">что делаем с версией</span>
          <div class="row">
            <label class="checkbox">
              <input v-model="publishMode" type="radio" value="replace" />
              перезаписать {{ originalVersion }} (полная замена файлов версии)
            </label>
            <label class="checkbox">
              <input v-model="publishMode" type="radio" value="new" />
              опубликовать как новую версию
            </label>
          </div>
        </div>

        <div v-if="dependencyOptions.length > 0" class="field">
          <span class="field__label">зависимости</span>
          <div class="chip-row">
            <button
              v-for="option in dependencyOptions"
              :key="option.slug"
              type="button"
              class="badge"
              :class="{ 'badge--accent': dependencies.includes(option.slug) }"
              @click="toggleDependency(option.slug)"
            >
              {{ dependencies.includes(option.slug) ? "✓" : "+" }} {{ option.slug }}
            </button>
          </div>
          <span class="field__hint">closet-cli поставит их автоматически вместе с этим плагином</span>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel__head">
        <h2>Файлы</h2>
        <span class="spacer" />
        <span class="badge badge--muted">{{ files.length }} / {{ MAX_FILES_PER_VERSION }}</span>
        <span class="badge badge--muted">{{ formatBytes(totalSize) }}</span>
      </div>

      <div class="panel__body stack">
        <div
          class="dropzone"
          :class="{ 'dropzone--over': dragOver }"
          @click="fileInput?.click()"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="onDrop"
        >
          <strong>Перетащите файлы или папку сюда</strong>
          <span class="tiny">
            component и ai определяются по пути (<code>hooks/</code>, <code>skills/codex/</code>, …) и правятся вручную
          </span>
          <!-- Настоящие <button>, а не <span>: клик по всей зоне — удобство, а доступный
               с клавиатуры путь должен существовать. Вложение button в div легально. -->
          <span class="row">
            <button type="button" class="btn btn--sm" @click.stop="fileInput?.click()">выбрать файлы</button>
            <button type="button" class="btn btn--sm" @click.stop="dirInput?.click()">выбрать папку</button>
            <button type="button" class="btn btn--sm" @click.stop="addEmptyFile()">создать пустой</button>
            <button type="button" class="btn btn--sm btn--primary" @click.stop="addSpecFile()">
              универсальный агент
            </button>
          </span>
        </div>

        <input ref="fileInput" type="file" multiple hidden @change="addBrowserFiles(($event.target as HTMLInputElement).files)" />
        <!-- webkitdirectory — единственный работающий в браузерах способ выбрать папку целиком -->
        <input
          ref="dirInput"
          type="file"
          multiple
          webkitdirectory
          hidden
          @change="addBrowserFiles(($event.target as HTMLInputElement).files)"
        />

        <div v-if="localErrors.length > 0" class="alert alert--error">
          <div>
            <div v-for="message in localErrors" :key="message">{{ message }}</div>
          </div>
        </div>

        <div v-if="files.length === 0" class="state">
          <span class="state__title">Файлов пока нет</span>
          <span class="tiny">Минимум один файл обязателен — реестр не примет пустую версию</span>
        </div>

        <div v-else>
          <div v-for="file in files" :key="file.id" class="file-row">
            <div v-if="file.format === 'spec'" class="file-row__head">
              <ComponentBadge :component="file.component" :ai="null" />
              <span class="badge badge--accent nowrap">универсальный</span>
              <code class="file-row__path">{{ fileRelativePath(file) || "имя не задано" }}</code>
              <span v-for="target in file.targets" :key="target" class="badge nowrap">{{ target }}</span>
              <button type="button" class="btn btn--sm btn--ghost" @click="toggleExpanded(file.id)">
                {{ expanded.has(file.id) ? "свернуть" : "настроить" }}
              </button>
              <button type="button" class="btn btn--sm btn--danger" @click="removeFile(file.id)">×</button>
            </div>

            <div v-else class="file-row__head">
              <ComponentBadge :component="file.component" :ai="file.ai" />
              <input v-model="file.relativePath" class="input input--mono file-row__path" placeholder="path/inside/component.md" />
              <span class="badge badge--muted nowrap">{{ file.kind === "binary" ? "bin" : formatBytes(file.text.length) }}</span>
              <button type="button" class="btn btn--sm btn--ghost" @click="toggleExpanded(file.id)">
                {{ expanded.has(file.id) ? "свернуть" : "настроить" }}
              </button>
              <button type="button" class="btn btn--sm btn--danger" @click="removeFile(file.id)">×</button>
            </div>

            <div v-if="file.format === 'spec' && expanded.has(file.id)" class="file-row__body stack">
              <template v-if="file.draft">
                <div class="form-grid">
                  <div class="field">
                    <span class="field__label">имя агента</span>
                    <input v-model="file.draft.name" class="input input--mono" placeholder="reviewer" />
                    <span class="field__hint">станет именем файла: <code>{{ fileRelativePath(file) || "—" }}</code></span>
                  </div>
                  <div class="field">
                    <span class="field__label">описание</span>
                    <input v-model="file.draft.description" class="input" placeholder="Когда вызывать этого агента" />
                  </div>
                </div>

                <div class="field">
                  <span class="field__label">текст агента (промпт)</span>
                  <textarea v-model="file.draft.body" class="textarea textarea--mono" rows="12" spellcheck="false" />
                </div>

                <div class="field">
                  <span class="field__label">цели</span>
                  <div class="row">
                    <label
                      v-for="harness in HARNESS_IDS"
                      :key="harness"
                      class="checkbox"
                      :class="{ 'checkbox--off': !isHarnessSupported(file.component, harness) }"
                      :title="isHarnessSupported(file.component, harness) ? '' : `${file.component} не поддерживается для ${harness}`"
                    >
                      <input
                        type="checkbox"
                        :checked="file.targets.includes(harness)"
                        :disabled="!isHarnessSupported(file.component, harness)"
                        @change="toggleTarget(file, harness)"
                      />
                      {{ harness }}
                    </label>
                  </div>
                  <span class="field__hint">под каждую цель реестр сам соберёт файл нужного формата</span>
                </div>

                <details v-for="harness in HARNESS_IDS" :key="harness" class="extras">
                  <summary>Доп. поля для {{ harness === "claude-code" ? "Claude" : "Codex" }} (YAML)</summary>
                  <textarea
                    v-model="file.draft.extras[harness]"
                    class="textarea textarea--mono"
                    rows="4"
                    spellcheck="false"
                    :placeholder="harness === 'claude-code' ? 'model: sonnet' : 'model_reasoning_effort: high'"
                  />
                  <span class="field__hint">
                    Попадают только в файл этого harness'а как есть: общего «языка» для инструментов и моделей нет.
                  </span>
                </details>
              </template>

              <template v-else>
                <div class="alert alert--error">
                  Исходник не разобрался как универсальный элемент — правьте текст целиком (frontmatter с
                  <code>name</code> и <code>description</code>).
                </div>
                <textarea v-model="file.text" class="textarea textarea--mono" rows="12" spellcheck="false" />
              </template>

              <div v-if="file.targets.length > 0" class="field">
                <span class="field__label">что получится</span>
                <div class="row">
                  <button
                    v-for="harness in file.targets"
                    :key="harness"
                    type="button"
                    class="badge"
                    :class="{ 'badge--accent': activePreviewTab(file) === harness }"
                    @click="previewTabs = { ...previewTabs, [file.id]: harness }"
                  >
                    {{ harness }}
                  </button>
                </div>
                <template v-for="item in previewSpec(file)" :key="item.harness">
                  <div v-if="item.harness === activePreviewTab(file)" class="preview">
                    <div v-if="item.error" class="alert alert--error">{{ item.error }}</div>
                    <template v-else-if="item.rendered">
                      <div class="row">
                        <code>agents/{{ item.harness }}/{{ item.rendered.relativePath }}</code>
                        <span class="spacer" />
                        <span v-if="findOverride(item.harness, item.rendered.relativePath)" class="badge badge--accent">
                          переопределён своим файлом
                        </span>
                        <button type="button" class="btn btn--sm" @click="overrideWithOwnFile(file, item.harness)">
                          {{ findOverride(item.harness, item.rendered.relativePath) ? "открыть свой файл" : "заменить на свой файл" }}
                        </button>
                      </div>
                      <pre class="preview__code">{{ item.rendered.content }}</pre>
                    </template>
                  </div>
                </template>
              </div>
            </div>

            <div v-else-if="file.format === 'raw' && expanded.has(file.id)" class="file-row__body stack">
              <div class="form-grid">
                <div class="field">
                  <span class="field__label">component</span>
                  <select v-model="file.component" class="select input--mono">
                    <option v-for="component in PLUGIN_COMPONENTS" :key="component" :value="component">
                      {{ component }}
                    </option>
                  </select>
                </div>

                <div class="field">
                  <span class="field__label">ai</span>
                  <select
                    class="select input--mono"
                    :value="file.ai ?? ''"
                    @change="file.ai = (($event.target as HTMLSelectElement).value || null) as PluginFileAi | null"
                  >
                    <option value="">общий для всех ИИ</option>
                    <option v-for="ai in PLUGIN_FILE_AI_VALUES" :key="ai" :value="ai">{{ ai }}</option>
                  </select>
                </div>
              </div>

              <div class="row">
                <label class="checkbox">
                  <input v-model="file.rootPath" type="checkbox" />
                  rootPath (в корень проекта, не в каталог ИИ)
                </label>
                <label class="checkbox">
                  <input v-model="file.merge" type="checkbox" @change="onMergeToggle(file)" />
                  merge (вливается в общий json/toml)
                </label>
                <label class="checkbox">
                  <input v-model="file.template" type="checkbox" />
                  <!-- v-pre: иначе двойные скобки внутри <code> Vue принял бы за интерполяцию -->
                  template (подстановка <code v-pre>{{projectRoot}}</code>)
                </label>
              </div>

              <div v-if="file.merge" class="field">
                <span class="field__label">mergeKeyPath</span>
                <input v-model="file.mergeKeyPath" class="input input--mono" placeholder="mcpServers.my-server" />
                <span class="field__hint">
                  Именованный слот в целевом файле. Для массивов — суффикс <code>[]</code>, например
                  <code>hooks.PostToolUse[]</code>. Содержимое merge-файла всегда JSON, даже если цель — TOML.
                </span>
              </div>

              <div v-if="file.kind === 'text' && file.component === 'agents'" class="row">
                <button type="button" class="btn btn--sm" @click="importAsSpec(file)">
                  импортировать как универсальный агент
                </button>
                <span class="field__hint">name/description станут общими, остальные поля frontmatter — блоком Claude</span>
              </div>

              <div v-if="file.kind === 'text'" class="field">
                <span class="field__label">содержимое</span>
                <textarea v-model="file.text" class="textarea textarea--mono" rows="12" spellcheck="false" />
              </div>
              <div v-else class="alert alert--info">
                Бинарный файл ({{ formatBytes(file.sizeBytes) }}) — содержимое не редактируется, но сохранится как есть.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="touched && validationErrors.length > 0" class="alert alert--error">
      <div>
        <div v-for="message in validationErrors" :key="message">{{ message }}</div>
      </div>
    </div>

    <div v-if="props.error" class="alert alert--error">{{ props.error }}</div>

    <div class="row">
      <button type="submit" class="btn btn--primary" :disabled="props.submitting">
        <span v-if="props.submitting" class="spinner" />
        {{ props.mode === "create" ? "Опубликовать плагин" : publishMode === "replace" ? "Сохранить версию" : "Опубликовать новую версию" }}
      </button>
      <NuxtLink
        class="btn"
        :to="props.mode === 'edit' && props.initial ? `/plugins/${encodeURIComponent(props.initial.slug)}` : '/'"
      >
        Отмена
      </NuxtLink>
    </div>
  </form>
</template>

<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card-bg);
  overflow: hidden;
}

.panel + .panel {
  margin-top: 16px;
}

.panel__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.panel__body {
  padding: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field__hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.input,
.select,
.textarea {
  width: 100%;
  padding: 8px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  transition:
    border-color 0.12s ease,
    box-shadow 0.12s ease;
}

.input:focus,
.select:focus,
.textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.input--mono,
.textarea--mono {
  font-family: var(--font-mono);
}

.textarea {
  resize: vertical;
  min-height: 88px;
  line-height: 1.5;
}

.select {
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--text-tertiary) 50%),
    linear-gradient(135deg, var(--text-tertiary) 50%, transparent 50%);
  background-position:
    calc(100% - 15px) calc(50% + 1px),
    calc(100% - 10px) calc(50% + 1px);
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
  padding-right: 30px;
}

.checkbox {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.checkbox input {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
  cursor: pointer;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}

.badge--muted {
  color: var(--text-tertiary);
}

.badge--accent {
  border-color: #7a4232;
  background: var(--accent-light);
  color: var(--accent-hover);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 7px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
  white-space: nowrap;
}

.btn:hover:not(:disabled) {
  background: var(--surface-3);
  border-color: #4a525c;
  color: #e6edf3;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #1b1008;
  font-weight: 600;
}

.btn--primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: #1b1008;
}

.btn--danger {
  border-color: #6e2b28;
  background: var(--danger-bg);
  color: #ff8a80;
}

.btn--danger:hover:not(:disabled) {
  background: #f8514933;
  border-color: var(--danger);
  color: #ffb3ab;
}

.btn--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-secondary);
}

.btn--ghost:hover:not(:disabled) {
  background: var(--surface-2);
  color: #e6edf3;
}

.btn--sm {
  padding: 4px 9px;
  font-size: 12px;
}

.alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: 13px;
}

.alert--error {
  border-color: #6e2b28;
  background: var(--danger-bg);
  color: #ffb3ab;
}

.alert--info {
  border-color: #2b4b7d;
  background: #388bfd1a;
  color: #a5d6ff;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 56px 24px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  background: #161b2280;
  text-align: center;
  color: var(--text-secondary);
}

.state__title {
  font-family: var(--font-mono);
  font-size: 14px;
  color: #e6edf3;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #ffffff26;
  border-top-color: var(--accent);
  border-radius: 999px;
  animation: spin 0.7s linear infinite;
  flex: none;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 20px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  background: #0d111780;
  color: var(--text-secondary);
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.12s ease,
    background 0.12s ease;
}

.dropzone:hover,
.dropzone--over {
  border-color: var(--accent);
  background: var(--accent-light);
}

.file-row {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.file-row + .file-row {
  margin-top: 8px;
}

.file-row__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
}

.file-row__path {
  flex: 1;
  min-width: 0;
}

.checkbox--off {
  opacity: 0.45;
  cursor: not-allowed;
}

.extras summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
}

.extras[open] summary {
  margin-bottom: 8px;
}

.preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview__code {
  max-height: 320px;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.file-row__body {
  padding: 0 10px 10px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
</style>
