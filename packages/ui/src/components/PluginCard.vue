<script setup lang="ts">
import type { PluginListItem } from "@closet/contract";
import { computed, type Component } from "vue";

import { formatDate } from "../format";

const props = withDefaults(
  defineProps<{
    plugin: PluginListItem;
    /** Куда ведёт карточка. */
    to: string;
    /** Компонент-ссылка (например NuxtLink); по умолчанию обычный `<a>`. */
    as?: string | Component;
  }>(),
  { as: "a" },
);

// Обычный <a> ждёт href, роутерные ссылки (NuxtLink/RouterLink) — to.
const linkProps = computed(() => (typeof props.as === "string" ? { href: props.to } : { to: props.to }));
</script>

<template>
  <component :is="props.as" class="card" v-bind="linkProps">
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
  </component>
</template>
