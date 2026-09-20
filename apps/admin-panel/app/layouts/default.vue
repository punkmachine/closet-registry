<script setup lang="ts">
// Статус реестра в шапке: админка бесполезна без бэкенда, и «ничего не грузится» должно
// сразу читаться как «реестр недоступен», а не как пустой список плагинов.
const { data: health } = useFetch("/api/health", { lazy: true, server: false });

const registryState = computed(() => {
  if (!health.value) {
    return { cls: "", label: "проверяем реестр…" };
  }
  if (health.value.registry !== "ok") {
    return { cls: "dot--err", label: "реестр недоступен" };
  }
  if (health.value.registryDb !== "ok") {
    return { cls: "dot--warn", label: "реестр без БД" };
  }
  return { cls: "dot--ok", label: "реестр на связи" };
});
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <div class="container topbar__inner">
        <NuxtLink to="/" class="brand">
          <span class="brand__mark">◇</span>
          closet<span class="brand__muted">-registry</span>
        </NuxtLink>

        <span class="topbar__spacer" />

        <span class="badge" :title="health?.registryUrl">
          <span class="dot" :class="registryState.cls" />
          {{ registryState.label }}
        </span>

        <NuxtLink to="/plugins/new" class="btn btn--primary btn--sm"> + новый плагин </NuxtLink>
      </div>
    </header>

    <main class="page">
      <div class="container">
        <slot />
      </div>
    </main>
  </div>
</template>
