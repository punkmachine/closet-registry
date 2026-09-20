<script setup lang="ts">
import type { PluginAi, PluginComponent } from "~~/shared/types/registry";

const props = defineProps<{
  component: PluginComponent;
  ai?: PluginAi | null;
}>();
</script>

<template>
  <span class="badge" :class="`badge--${props.component}`">
    {{ props.component }}
    <template v-if="props.ai">· {{ props.ai }}</template>
  </span>
</template>
