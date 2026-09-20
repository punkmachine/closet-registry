<script setup lang="ts">
import type { PluginListItem } from "~~/shared/types/registry";

const props = defineProps<{ plugin: PluginListItem }>();
</script>

<template>
  <NuxtLink class="card" :to="`/plugins/${encodeURIComponent(props.plugin.slug)}`">
    <div class="card__top">
      <span class="card__title">{{ props.plugin.slug }}</span>
      <span class="spacer" />
      <span class="badge badge--version">v{{ props.plugin.latestVersion }}</span>
    </div>

    <p class="card__desc">
      {{ props.plugin.description || "без описания" }}
    </p>

    <div class="card__foot">
      <span>обновлён {{ formatDate(props.plugin.updatedAt) }}</span>
    </div>
  </NuxtLink>
</template>
