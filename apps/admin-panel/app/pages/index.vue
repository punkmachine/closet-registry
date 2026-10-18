<script setup lang="ts">
import type { PluginListResponse } from "@closet/contract";
import { PluginCard } from "@closet/ui";
import { errorMessage } from "~/utils/format";

const NuxtLink = resolveComponent("NuxtLink");
const { can } = useAuth();

const { data, pending, error, refresh } = await useFetch<PluginListResponse>("/api/plugins");

const query = ref("");
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
          <template v-if="can('plugins', 'write')">Кнопка публикации — в шапке.</template>
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
      <template v-if="can('plugins', 'write')">
        <span class="tiny">Опубликуйте первый — или сделайте это через <code>POST /v1/admin/plugins</code></span>
        <NuxtLink to="/plugins/new" class="btn btn--primary mt-2">+ новый плагин</NuxtLink>
      </template>
    </div>

    <div v-else-if="filtered.length === 0" class="state">
      <span class="state__title">Ничего не нашлось по «{{ query }}»</span>
    </div>

    <div v-else class="grid" :class="{ 'grid--list': view === 'list' }">
      <PluginCard
        v-for="plugin in filtered"
        :key="plugin.slug"
        :plugin="plugin"
        :as="NuxtLink"
        :to="`/plugins/${encodeURIComponent(plugin.slug)}`"
      />
    </div>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.page-head__text {
  flex: 1;
  min-width: 260px;
}

.page-head__sub {
  margin-top: 6px;
  color: var(--text-secondary);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.search {
  position: relative;
  flex: 1;
  max-width: 380px;
}

.search .input {
  padding-left: 32px;
  font-family: var(--font-mono);
}

.search__icon {
  position: absolute;
  left: 11px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
  font-size: 12px;
  pointer-events: none;
}

.input {
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

.input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.input--mono {
  font-family: var(--font-mono);
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

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 14px;
}

.grid--list {
  grid-template-columns: 1fr;
  gap: 8px;
}
</style>
