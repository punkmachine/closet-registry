<script setup lang="ts">
import type { PluginListResponse } from "@closet/contract";
import { buildFormData, type PluginFormValues } from "~/utils/plugin-files";

definePageMeta({ permission: { resource: "plugins", action: "write" } });

const router = useRouter();

const { data: list } = await useFetch<PluginListResponse>("/api/plugins");

const submitting = ref(false);
const submitError = ref<string | null>(null);

async function onSubmit(values: PluginFormValues): Promise<void> {
  submitting.value = true;
  submitError.value = null;

  try {
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
</style>
