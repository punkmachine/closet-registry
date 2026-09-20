<script setup lang="ts">
import type { PluginListResponse } from "~~/shared/types/registry";

const { data, pending, error, refresh } = await useFetch<PluginListResponse>("/api/plugins");

const query = ref("");
// В cookie, а не в localStorage: режим отображения тогда доступен и при SSR, без мигания раскладки.
const view = useCookie<"grid" | "list">("closet-view", { default: () => "grid", sameSite: "lax" });

const plugins = computed(() => data.value?.plugins ?? []);

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (!needle) {
    return plugins.value;
  }
  return plugins.value.filter(
    (plugin) =>
      plugin.slug.toLowerCase().includes(needle) || plugin.description.toLowerCase().includes(needle),
  );
});
</script>

<template>
  <div>
    <div class="page-head">
      <div class="page-head__text">
        <h1>Плагины</h1>
        <p class="page-head__sub">
          Содержимое self-hosted реестра, из которого <code>closet-cli</code> ставит файлы в проекты.
          Кнопка публикации — в шапке.
        </p>
      </div>
    </div>

    <div class="toolbar">
      <div class="search">
        <span class="search__icon">⌕</span>
        <input v-model="query" class="input" placeholder="поиск по slug или описанию" />
      </div>

      <span class="spacer" />

      <span class="badge badge--muted">{{ filtered.length }} из {{ plugins.length }}</span>

      <div class="row" style="gap: 4px">
        <button type="button" class="btn btn--sm" :class="{ 'btn--primary': view === 'grid' }" @click="view = 'grid'">
          плитка
        </button>
        <button type="button" class="btn btn--sm" :class="{ 'btn--primary': view === 'list' }" @click="view = 'list'">
          список
        </button>
      </div>

      <button type="button" class="btn btn--sm" :disabled="pending" @click="refresh()">обновить</button>
    </div>

    <div v-if="error" class="alert alert--error">
      <div>
        <strong>Не удалось получить список плагинов.</strong>
        <div class="tiny">{{ errorMessage(error) }}</div>
      </div>
    </div>

    <div v-else-if="pending && plugins.length === 0" class="state">
      <span class="spinner" />
      <span class="state__title">Загружаем реестр…</span>
    </div>

    <div v-else-if="plugins.length === 0" class="state">
      <span class="state__title">В реестре пока нет плагинов</span>
      <span class="tiny">Опубликуйте первый — или сделайте это через <code>POST /v1/admin/plugins</code></span>
      <NuxtLink to="/plugins/new" class="btn btn--primary mt-2">+ новый плагин</NuxtLink>
    </div>

    <div v-else-if="filtered.length === 0" class="state">
      <span class="state__title">Ничего не нашлось по «{{ query }}»</span>
    </div>

    <div v-else class="grid" :class="{ 'grid--list': view === 'list' }">
      <PluginCard v-for="plugin in filtered" :key="plugin.slug" :plugin="plugin" />
    </div>
  </div>
</template>
