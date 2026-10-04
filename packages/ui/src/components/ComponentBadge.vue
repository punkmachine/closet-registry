<script setup lang="ts">
import type { PluginComponent, PluginFileAi } from "@closet/contract";

const props = defineProps<{
  component: PluginComponent;
  ai?: PluginFileAi | null;
}>();
</script>

<template>
  <span class="badge" :class="`badge--${props.component}`">
    {{ props.component }}
    <template v-if="props.ai">· {{ props.ai }}</template>
  </span>
</template>
