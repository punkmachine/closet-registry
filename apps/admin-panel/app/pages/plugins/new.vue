<script setup lang="ts">
import type { PluginListResponse } from "~~/shared/types/registry";
import { buildFormData, type PluginFormValues } from "~/utils/plugin-files";

const router = useRouter();

const { data: list } = await useFetch<PluginListResponse>("/api/plugins");

const submitting = ref(false);
const submitError = ref<string | null>(null);

async function onSubmit(values: PluginFormValues): Promise<void> {
  submitting.value = true;
  submitError.value = null;

  try {
    // FormData уходит как есть: Nitro-прокси пробрасывает тело байт-в-байт, чтобы boundary совпал.
    await $fetch("/api/plugins", { method: "POST", body: buildFormData(values) });
    await router.push(`/plugins/${encodeURIComponent(values.slug)}`);
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
          <span>новый</span>
        </div>
        <h1>Новый плагин</h1>
        <p class="page-head__sub">
          Укажите slug и закиньте файлы — компонент (<code>hooks</code>, <code>skills</code>, <code>mcp</code>, …)
          определится по пути, но его можно поправить у каждого файла.
        </p>
      </div>
    </div>

    <PluginForm
      mode="create"
      :available-plugins="list?.plugins ?? []"
      :submitting="submitting"
      :error="submitError"
      @submit="onSubmit"
    />
  </div>
</template>
