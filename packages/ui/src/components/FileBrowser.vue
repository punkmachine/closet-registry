<script setup lang="ts">
import type { PluginBundleFile, PluginComponent } from "@closet/contract";
import { computed, ref, watch } from "vue";

import { formatBytes } from "../format";
import ComponentBadge from "./ComponentBadge.vue";

interface Props {
  files: PluginBundleFile[];
}

const props = defineProps<Props>();

const selectedIndex = ref(0);

/**
 * Группировка по компоненту повторяет структуру хранения в реестре
 * (<component>/[<ai>/]<relativePath>), поэтому дерево совпадает с тем, что лежит на диске.
 */
const groups = computed(() => {
  const byComponent = new Map<PluginComponent, { file: PluginBundleFile; index: number }[]>();

  for (const [index, file] of props.files.entries()) {
    const bucket = byComponent.get(file.component) ?? [];

    bucket.push({ file, index });
    byComponent.set(file.component, bucket);
  }

  return [...byComponent.entries()].map(([component, items]) => ({
    component,
    items: items.sort((a, b) => a.file.relativePath.localeCompare(b.file.relativePath)),
  }));
});

const selected = computed(() => props.files[selectedIndex.value] ?? null);

const selectedText = computed(() => {
  if (!selected.value) {
    return "";
  }
  return selected.value.encoding === "utf8"
    ? selected.value.content
    : "// бинарный файл — содержимое не отображается";
});

watch(
  () => props.files,
  () => {
    selectedIndex.value = 0;
  },
);
</script>

<template>
  <section
    v-if="props.files.length === 0"
    class="state"
  >
    <span class="state__title">В этой версии нет файлов</span>
  </section>

  <div
    v-else
    class="columns"
  >
    <section class="panel">
      <header class="panel__head">
        <h3>Файлы</h3>
        <span class="spacer" />
        <span class="badge badge--muted">{{ props.files.length }}</span>
      </header>

      <div class="panel__body panel__body--flush">
        <nav class="tree">
          <template
            v-for="group in groups"
            :key="group.component"
          >
            <div class="tree__group">{{ group.component }}</div>
            <button
              v-for="item in group.items"
              :key="item.index"
              type="button"
              class="tree__item"
              :class="{ 'tree__item--active': item.index === selectedIndex }"
              @click="selectedIndex = item.index"
            >
              <span
                class="tree__name"
                :title="item.file.relativePath"
              >
                {{ item.file.relativePath }}
              </span>
              <span
                v-if="item.file.ai"
                class="dim tiny"
              >
                {{ item.file.ai }}
              </span>
              <span
                v-if="item.file.merge"
                class="badge badge--accent"
              >
                merge
              </span>
            </button>
          </template>
        </nav>
      </div>
    </section>

    <div
      v-if="selected"
      class="stack"
    >
      <section class="panel">
        <header class="panel__head">
          <ComponentBadge
            :component="selected.component"
            :ai="selected.ai"
          />
          <span
            class="mono tiny"
            :title="selected.relativePath"
          >
            {{ selected.relativePath }}
          </span>
          <span class="spacer" />
          <span class="badge badge--muted">{{ formatBytes(selected.sizeBytes) }}</span>
        </header>

        <div class="panel__body">
          <dl class="meta-list">
            <dt>sha256</dt>
            <dd class="mono tiny">{{ selected.sha256 }}</dd>

            <dt>флаги</dt>
            <dd class="chip-row">
              <span
                v-if="selected.rootPath"
                class="badge"
              >
                rootPath
              </span>
              <span
                v-if="selected.merge"
                class="badge badge--accent"
              >
                merge
              </span>
              <span
                v-if="selected.template"
                class="badge"
              >
                template
              </span>
              <span
                v-if="!selected.rootPath && !selected.merge && !selected.template"
                class="dim tiny"
              >
                —
              </span>
            </dd>

            <template v-if="selected.mergeKeyPath">
              <dt>mergeKeyPath</dt>
              <dd class="mono tiny">{{ selected.mergeKeyPath }}</dd>
            </template>
          </dl>
        </div>
      </section>

      <section class="panel">
        <header class="panel__head panel__head--plain">
          <h3>Содержимое</h3>
          <span class="spacer" />
          <span class="badge badge--muted">{{ selected.encoding }}</span>
        </header>
        <pre class="code">{{ selectedText }}</pre>
      </section>
    </div>
  </div>
</template>

<!-- TODO: цвета все в переменные -->
<style scoped>
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

.panel__body--flush {
  padding: 0;
}

.panel__head--plain {
  background: transparent;
}

.meta-list {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 14px;
  font-size: 12.5px;
}

.meta-list dt {
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

.meta-list dd {
  margin: 0;
  color: var(--text-primary);
  overflow-wrap: anywhere;
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

.columns {
  display: grid;
  grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

@media (max-width: 860px) {
  .columns {
    grid-template-columns: 1fr;
  }
}

.tree {
  display: flex;
  flex-direction: column;
  max-height: 560px;
  overflow: auto;
}

.tree__group {
  padding: 8px 12px 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
  border-top: 1px solid var(--border);
}

.tree__group:first-child {
  border-top: none;
}

.tree__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  border: none;
  border-left: 2px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-family: var(--font-mono);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.tree__item:hover {
  background: var(--surface-2);
  color: #e6edf3;
}

.tree__item--active {
  border-left-color: var(--accent);
  background: var(--accent-light);
  color: #e6edf3;
}

.tree__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code {
  margin: 0;
  padding: 14px 16px;
  max-height: 560px;
  overflow: auto;
  background: var(--surface-0);
  font-size: 12.5px;
  line-height: 1.6;
  color: #c9d1d9;
  tab-size: 2;
  white-space: pre;
}
</style>
