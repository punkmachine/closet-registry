<script setup lang="ts">
import type { PluginBundle, PluginListResponse } from "@closet/contract";
import { errorMessage } from "~/utils/format";
import { buildFormData, type PluginFormValues } from "~/utils/plugin-files";

definePageMeta({ permission: { resource: "plugins", action: "write" } });

const route = useRoute();
const router = useRouter();

const slug = computed(() => String(route.params.slug));
const versionParam = computed(() => (typeof route.query.version === "string" ? route.query.version : "latest"));

const { data: bundle, error: loadError } = await useFetch<PluginBundle>(
  () => `/api/plugins/${encodeURIComponent(slug.value)}/${encodeURIComponent(versionParam.value)}`,
);

const { data: list } = await useFetch<PluginListResponse>("/api/plugins");

const submitting = ref(false);
const submitError = ref<string | null>(null);

async function onSubmit(values: PluginFormValues, publishMode: "replace" | "new"): Promise<void> {
  submitting.value = true;
  submitError.value = null;

  try {
    const body = buildFormData(values);

    if (publishMode === "replace") {
      const url: string = `/api/plugins/${encodeURIComponent(slug.value)}/${encodeURIComponent(values.version)}`;
      await $fetch(url, { method: "PUT", body });
    } else {
      await $fetch("/api/plugins", { method: "POST", body });
    }

    await router.push(`/plugins/${encodeURIComponent(slug.value)}?version=${encodeURIComponent(values.version)}`);
  } catch (error) {
    submitError.value = errorMessage(error);
  } finally {
    submitting.value = false;
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
          <NuxtLink :to="`/plugins/${encodeURIComponent(slug)}`">{{ slug }}</NuxtLink>
          <span>/</span>
          <span>редактирование</span>
        </div>
        <h1>Редактирование</h1>
        <p class="page-head__sub">
          Реестр принимает версию только целиком, поэтому форма отправляет полный набор файлов —
          удалённая здесь строка исчезнет и в реестре.
        </p>
      </div>
    </div>

    <div v-if="loadError" class="alert alert--error">
      <div>
        <strong>Не удалось загрузить версию для редактирования.</strong>
        <div class="tiny">{{ errorMessage(loadError) }}</div>
      </div>
    </div>

    <div v-else-if="!bundle" class="state">
      <span class="spinner" />
      <span class="state__title">Загружаем версию…</span>
    </div>

    <PluginForm
      v-else
      mode="edit"
      :initial="bundle"
      :available-plugins="list?.plugins ?? []"
      :submitting="submitting"
      :error="submitError"
      @submit="onSubmit"
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
</style>
