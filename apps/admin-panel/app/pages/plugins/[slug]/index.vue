<script setup lang="ts">
import type { PluginBundle, PluginVersionListResponse } from "~~/shared/types/registry";

const route = useRoute();
const router = useRouter();
const slug = computed(() => String(route.params.slug));

const {
  data: versionList,
  error: versionsError,
  refresh: refreshVersions,
} = await useFetch<PluginVersionListResponse>(() => `/api/plugins/${encodeURIComponent(slug.value)}/versions`);

const versions = computed(() => versionList.value?.versions ?? []);

// Версия в query, а не в пути: ссылка на конкретную версию шарится, но при этом страница
// остаётся одна и не требует вложенного роутинга.
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

    await $fetch(`/api/plugins/${encodeURIComponent(slug.value)}/${encodeURIComponent(target.version)}`, {
      method: "DELETE",
    });

    deleteTarget.value = null;
    // Если удалили последнюю версию, плагин уходит из листинга — возвращаемся на главную.
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
          v-if="selectedVersion"
          class="btn"
          :to="`/plugins/${encodeURIComponent(slug)}/edit?version=${encodeURIComponent(selectedVersion)}`"
        >
          редактировать
        </NuxtLink>
        <button type="button" class="btn btn--danger" @click="deleteTarget = { kind: 'plugin' }">удалить плагин</button>
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
              <span class="tiny dim version-row__log">{{ item.changelog || "без changelog" }}</span>
            </button>
            <button
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
