<script setup lang="ts">
interface Props {
  title?: string;
  flush?: boolean;
}

const props = withDefaults(defineProps<Props>(), { title: "", flush: false });
</script>

<template>
  <section class="panel">
    <div v-if="props.title" class="panel__head">
      <h2>{{ props.title }}</h2>
    </div>
    <div class="panel__body" :class="{ 'panel__body--flush': props.flush }">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card-bg);
  overflow: hidden;
}

.panel__head {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.panel__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.panel__body--flush {
  display: block;
  padding: 0;
  overflow-x: auto;
}
</style>
