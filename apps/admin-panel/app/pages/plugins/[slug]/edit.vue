<script setup lang="ts">
import type { PluginBundle, PluginListResponse } from "~~/shared/types/registry";
import { buildFormData, type PluginFormValues } from "~/utils/plugin-files";

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
      // PUT — full replace конкретной версии: реестр удаляет все её прежние файлы и зависимости.
      await $fetch(`/api/plugins/${encodeURIComponent(slug.value)}/${encodeURIComponent(values.version)}`, {
        method: "PUT",
        body,
      });
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
