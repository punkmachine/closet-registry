<script setup lang="ts">
import type { PluginBundle, PluginVersionListResponse } from "@closet/contract";
import { ConfirmDialog, FileBrowser, formatDate } from "@closet/ui";
import { errorMessage } from "~/utils/format";

const { can } = useAuth();
const route = useRoute();
const router = useRouter();
const slug = computed(() => String(route.params.slug));

const {
  data: versionList,
  error: versionsError,
  refresh: refreshVersions,
} = await useFetch<PluginVersionListResponse>(() => `/api/plugins/${encodeURIComponent(slug.value)}/versions`);

const versions = computed(() => versionList.value?.versions ?? []);

/**
 * Версия в query, а не в пути: ссылка на конкретную версию шарится, но при этом страница
 * остаётся одна и не требует вложенного роутинга.
 */
const selectedVersion = computed(() => {
  const fromQuery = route.query.version;
  const candidate = typeof fromQuery === "string" ? fromQuery : "";

  if (candidate && versions.value.some((item) => item.version === candidate)) {
    return candidate;
  }

  return versions.value[0]?.version ?? "";
});

const {
  data: bundle,
  pending: bundlePending,
  error: bundleError,
  refresh: refreshBundle,
} = await useFetch<PluginBundle>(
  () => `/api/plugins/${encodeURIComponent(slug.value)}/${encodeURIComponent(selectedVersion.value)}`,
  { immediate: false },
);

watch(
  selectedVersion,
  (version) => {
    if (version) {
      void refreshBundle();
    }
  },
  { immediate: true },
);

function selectVersion(version: string): void {
  void router.replace({ query: { ...route.query, version } });
}

/* ---------- удаление ---------- */

type DeleteTarget = { kind: "plugin" } | { kind: "version"; version: string };

const deleteTarget = ref<DeleteTarget | null>(null);
const deleting = ref(false);
const actionError = ref<string | null>(null);

const deleteDialog = computed(() => {
  if (!deleteTarget.value) {
    return null;
  }
  if (deleteTarget.value.kind === "plugin") {
    return {
      title: `Удалить плагин ${slug.value}?`,
      message:
        "Плагин и все его версии станут недоступны для closet-cli (soft delete — файлы на диске реестра остаются). Публикация новой версии под этим slug вернёт плагин.",
      confirmLabel: "Удалить плагин",
      confirmPhrase: slug.value,
    };
  }
  return {
    title: `Удалить версию ${deleteTarget.value.version}?`,
    message: "Версия перестанет отдаваться реестром. Остальные версии плагина не затрагиваются.",
    confirmLabel: "Удалить версию",
    confirmPhrase: null,
  };
});

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value;
  if (!target) {
    return;
  }

  deleting.value = true;
  actionError.value = null;

  try {
    if (target.kind === "plugin") {
      await $fetch(`/api/plugins/${encodeURIComponent(slug.value)}`, { method: "DELETE" });
      await router.push("/");
      return;
    }

    const versionUrl: string = `/api/plugins/${encodeURIComponent(slug.value)}/${encodeURIComponent(target.version)}`;
    await $fetch(versionUrl, { method: "DELETE" });

    deleteTarget.value = null;
    /** Если удалили последнюю версию, плагин уходит из листинга — возвращаемся на главную. */
    if (versions.value.length <= 1) {
      await router.push("/");
      return;
    }
    await router.replace({ query: {} });
    await refreshVersions();
  } catch (error) {
    actionError.value = errorMessage(error);
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div class="page-head__text">
        <div class="breadcrumbs">
          <NuxtLink to="/">плагины</NuxtLink>
          <span>/</span>
          <span>{{ slug }}</span>
        </div>
        <h1 class="mono">{{ slug }}</h1>
        <p class="page-head__sub">{{ bundle?.description || "без описания" }}</p>
      </div>

      <div class="row">
        <NuxtLink
          v-if="selectedVersion && can('plugins', 'write')"
          class="btn"
          :to="`/plugins/${encodeURIComponent(slug)}/edit?version=${encodeURIComponent(selectedVersion)}`"
        >
          редактировать
        </NuxtLink>
        <button
          v-if="can('plugins', 'delete')"
          type="button"
          class="btn btn--danger"
          @click="deleteTarget = { kind: 'plugin' }"
        >
          удалить плагин
        </button>
      </div>
    </div>

    <div v-if="versionsError" class="alert alert--error">
      <div>
        <strong>Плагин не открылся.</strong>
        <div class="tiny">{{ errorMessage(versionsError) }}</div>
      </div>
    </div>

    <template v-else>
      <div v-if="actionError" class="alert alert--error mb-3">{{ actionError }}</div>

      <div class="panel mb-3">
        <div class="panel__head">
          <h2>Версии</h2>
          <span class="spacer" />
          <span class="badge badge--muted">{{ versions.length }}</span>
        </div>
        <div class="panel__body panel__body--flush">
          <div v-if="versions.length === 0" class="panel__body dim tiny">Активных версий нет</div>
          <div
            v-for="item in versions"
            v-else
            :key="item.version"
            class="version-row"
            :class="{ 'version-row--active': item.version === selectedVersion }"
          >
            <button type="button" class="version-row__pick" @click="selectVersion(item.version)">
              <span class="badge" :class="item.version === selectedVersion ? 'badge--version' : ''">
                v{{ item.version }}
              </span>
              <span class="tiny nowrap">{{ item.fileCount }} файл(ов)</span>
              <span class="tiny nowrap dim">{{ formatDate(item.createdAt) }}</span>
              <span class="tiny dim nowrap">{{ item.updatedBy.username }}</span>
              <span class="tiny dim version-row__log">{{ item.changelog || "без changelog" }}</span>
            </button>
            <button
              v-if="can('plugins', 'delete')"
              type="button"
              class="btn btn--sm btn--ghost"
              @click="deleteTarget = { kind: 'version', version: item.version }"
            >
              удалить
            </button>
          </div>
        </div>
      </div>

      <div v-if="bundle" class="panel mb-3">
        <div class="panel__body">
          <dl class="meta-list">
            <dt>версия</dt>
            <dd class="mono">{{ bundle.version }}</dd>

            <dt>автор</dt>
            <dd>
              {{ bundle.createdBy.username }}
              <span v-if="bundle.updatedBy.username !== bundle.createdBy.username" class="dim">
                · изменил {{ bundle.updatedBy.username }}
              </span>
            </dd>

            <dt>зависимости</dt>
            <dd>
              <span v-if="bundle.dependencies.length === 0" class="dim">нет</span>
              <span v-else class="chip-row">
                <NuxtLink
                  v-for="dependency in bundle.dependencies"
                  :key="dependency"
                  class="badge badge--accent"
                  :to="`/plugins/${encodeURIComponent(dependency)}`"
                >
                  {{ dependency }}
                </NuxtLink>
              </span>
            </dd>

            <dt>changelog</dt>
            <dd>
              <span v-if="!bundle.changelog" class="dim">—</span>
              <span v-else>{{ bundle.changelog }}</span>
            </dd>
          </dl>
        </div>
      </div>

      <div v-if="bundleError" class="alert alert--error">
        <div>
          <strong>Не удалось прочитать файлы версии.</strong>
          <div class="tiny">{{ errorMessage(bundleError) }}</div>
        </div>
      </div>

      <div v-else-if="bundlePending && !bundle" class="state">
        <span class="spinner" />
        <span class="state__title">Читаем файлы версии…</span>
      </div>

      <FileBrowser v-else-if="bundle" :files="bundle.files" />
    </template>

    <ConfirmDialog
      :open="deleteTarget !== null"
      :title="deleteDialog?.title ?? ''"
      :message="deleteDialog?.message ?? ''"
      :confirm-label="deleteDialog?.confirmLabel"
      :confirm-phrase="deleteDialog?.confirmPhrase ?? null"
      :busy="deleting"
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
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

.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-family: var(--font-mono);
  font-size: 12px;
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

.badge--version {
  border-color: #3f5a3f;
  background: var(--success-bg);
  color: var(--success);
}

.badge--accent {
  border-color: #7a4232;
  background: var(--accent-light);
  color: var(--accent-hover);
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

.version-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 0;
  border-left: 2px solid transparent;
  border-top: 1px solid var(--border);
}

.version-row:first-child {
  border-top: none;
}

.version-row--active {
  border-left-color: var(--accent);
  background: var(--accent-light);
}

.version-row__pick {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  padding: 9px 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.version-row__pick:hover {
  color: #e6edf3;
}

.version-row__log {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
