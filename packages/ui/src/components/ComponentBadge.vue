<script setup lang="ts">
import type { PluginComponent, PluginFileAi } from "@closet/contract";

interface Props {
  component: PluginComponent;
  ai?: PluginFileAi | null;
}

const props = defineProps<Props>();
</script>

<template>
  <span
    class="badge"
    :class="`badge--${props.component}`"
  >
    {{ props.component }}
    <template v-if="props.ai">· {{ props.ai }}</template>
  </span>
</template>

<!-- TODO: привести цвета в палитру цветов через переменные -->
<style scoped>
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

.badge--mcp {
  border-color: #2b4b7d;
  background: #388bfd1a;
  color: #79c0ff;
}

.badge--rules {
  border-color: #4b3b7d;
  background: #a371f71a;
  color: #d2a8ff;
}

.badge--hooks {
  border-color: #6d541f;
  background: #d299221a;
  color: #e3b341;
}

.badge--agents {
  border-color: #245b45;
  background: #2ea0431a;
  color: #56d364;
}

.badge--commands {
  border-color: #6d2b52;
  background: #db61a21a;
  color: #f778ba;
}

.badge--skills {
  border-color: #1f5b60;
  background: #39c5cf1a;
  color: #56d4dd;
}

.badge--scripts {
  border-color: #7a4232;
  background: #d574551a;
  color: #e38d6e;
}
</style>
