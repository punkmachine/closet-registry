<script setup lang="ts">
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_VERSION,
  PLUGIN_AI_VALUES,
  PLUGIN_COMPONENTS,
  type PluginAi,
  type PluginBundle,
  type PluginListItem,
} from "~~/shared/types/registry";
import {
  emptyTextFormFile,
  formFileFromBrowserFile,
  formFileFromBundleFile,
  suggestMergeKeyPath,
  validateForm,
  type FormFile,
  type PluginFormValues,
} from "~/utils/plugin-files";

const props = defineProps<{
  mode: "create" | "edit";
  initial?: PluginBundle | null;
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

const dependencyOptions = computed(() => props.availablePlugins.filter((plugin) => plugin.slug !== slug.value));

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
            <div class="file-row__head">
              <ComponentBadge :component="file.component" :ai="file.ai" />
              <input v-model="file.relativePath" class="input input--mono file-row__path" placeholder="path/inside/component.md" />
              <span class="badge badge--muted nowrap">{{ file.kind === "binary" ? "bin" : formatBytes(file.text.length) }}</span>
              <button type="button" class="btn btn--sm btn--ghost" @click="toggleExpanded(file.id)">
                {{ expanded.has(file.id) ? "свернуть" : "настроить" }}
              </button>
              <button type="button" class="btn btn--sm btn--danger" @click="removeFile(file.id)">×</button>
            </div>

            <div v-if="expanded.has(file.id)" class="file-row__body stack">
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
                    @change="file.ai = (($event.target as HTMLSelectElement).value || null) as PluginAi | null"
                  >
                    <option value="">общий для всех ИИ</option>
                    <option v-for="ai in PLUGIN_AI_VALUES" :key="ai" :value="ai">{{ ai }}</option>
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
