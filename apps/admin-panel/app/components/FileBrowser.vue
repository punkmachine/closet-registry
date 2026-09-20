<script setup lang="ts">
import type { PluginBundleFile, PluginComponent } from "~~/shared/types/registry";

const props = defineProps<{ files: PluginBundleFile[] }>();

const selectedIndex = ref(0);

// Группировка по компоненту повторяет структуру хранения в реестре
// (<component>/[<ai>/]<relativePath>), поэтому дерево совпадает с тем, что лежит на диске.
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
  <div v-if="props.files.length === 0" class="state">
    <span class="state__title">В этой версии нет файлов</span>
  </div>

  <div v-else class="columns">
    <div class="panel">
      <div class="panel__head">
        <h3>Файлы</h3>
        <span class="spacer" />
        <span class="badge badge--muted">{{ props.files.length }}</span>
      </div>

      <div class="panel__body panel__body--flush">
        <div class="tree">
          <template v-for="group in groups" :key="group.component">
            <div class="tree__group">{{ group.component }}</div>
            <button
              v-for="item in group.items"
              :key="item.index"
              type="button"
              class="tree__item"
              :class="{ 'tree__item--active': item.index === selectedIndex }"
              @click="selectedIndex = item.index"
            >
              <span class="tree__name" :title="item.file.relativePath">{{ item.file.relativePath }}</span>
              <span v-if="item.file.ai" class="dim tiny">{{ item.file.ai }}</span>
              <span v-if="item.file.merge" class="badge badge--accent">merge</span>
            </button>
          </template>
        </div>
      </div>
    </div>

    <div v-if="selected" class="stack">
      <div class="panel">
        <div class="panel__head">
          <ComponentBadge :component="selected.component" :ai="selected.ai" />
          <span class="mono tiny" :title="selected.relativePath">{{ selected.relativePath }}</span>
          <span class="spacer" />
          <span class="badge badge--muted">{{ formatBytes(selected.sizeBytes) }}</span>
        </div>

        <div class="panel__body">
          <dl class="meta-list">
            <dt>sha256</dt>
            <dd class="mono tiny">{{ selected.sha256 }}</dd>

            <dt>флаги</dt>
            <dd class="chip-row">
              <span v-if="selected.rootPath" class="badge">rootPath</span>
              <span v-if="selected.merge" class="badge badge--accent">merge</span>
              <span v-if="selected.template" class="badge">template</span>
              <span v-if="!selected.rootPath && !selected.merge && !selected.template" class="dim tiny">—</span>
            </dd>

            <template v-if="selected.mergeKeyPath">
              <dt>mergeKeyPath</dt>
              <dd class="mono tiny">{{ selected.mergeKeyPath }}</dd>
            </template>
          </dl>
        </div>
      </div>

      <div class="panel">
        <div class="panel__head panel__head--plain">
          <h3>Содержимое</h3>
          <span class="spacer" />
          <span class="badge badge--muted">{{ selected.encoding }}</span>
        </div>
        <pre class="code">{{ selectedText }}</pre>
      </div>
    </div>
  </div>
</template>
