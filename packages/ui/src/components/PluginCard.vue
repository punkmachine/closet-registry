<script setup lang="ts">
import type { PluginListItem } from "@closet/contract";
import { type Component, computed } from "vue";

import { formatDate } from "../format";

interface Props {
  plugin: PluginListItem;
  to: string;
  as?: string | Component;
}

const props = withDefaults(defineProps<Props>(), { as: "a" });

const linkProps = computed(() => (typeof props.as === "string" ? { href: props.to } : { to: props.to }));
</script>

<template>
  <component
    :is="props.as"
    class="card"
    v-bind="linkProps"
  >
    <header class="card__top">
      <span class="card__title">{{ props.plugin.slug }}</span>
      <span class="spacer" />
      <span class="badge badge--version">v{{ props.plugin.latestVersion }}</span>
    </header>

    <p class="card__desc">
      {{ props.plugin.description || "без описания" }}
    </p>

    <footer class="card__foot">
      <span>обновлён {{ formatDate(props.plugin.updatedAt) }}</span>
      <span class="spacer" />
      <span :title="`создал ${props.plugin.createdBy.username}`">{{ props.plugin.updatedBy.username }}</span>
    </footer>
  </component>
</template>

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

.badge--version {
  border-color: #3f5a3f;
  background: var(--success-bg);
  color: var(--success);
}

.card {
  display: block;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card-bg);
  box-shadow: var(--shadow-card);
  transition:
    border-color 0.14s ease,
    background 0.14s ease,
    transform 0.14s ease;
}

a.card:hover {
  border-color: var(--accent);
  background: var(--card-hover);
  transform: translateY(-1px);
  color: var(--text-primary);
}

.card__top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.card__title {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  color: #e6edf3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__desc {
  color: var(--text-secondary);
  font-size: 13px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 40px;
}

.card__foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

:global(.grid--list) .card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
}

:global(.grid--list) .card__top {
  margin-bottom: 0;
  min-width: 220px;
}

:global(.grid--list) .card__desc {
  flex: 1;
  min-height: 0;
  -webkit-line-clamp: 1;
  line-clamp: 1;
}

:global(.grid--list) .card__foot {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}
</style>
