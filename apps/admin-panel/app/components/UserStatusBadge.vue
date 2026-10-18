<script setup lang="ts">
import type { User } from "@closet/contract";
import { formatDate } from "@closet/ui";

const props = defineProps<{ user: User }>();
</script>

<template>
  <span v-if="props.user.disabled" class="badge badge--danger">отключён</span>
  <span v-else-if="isUserLocked(props.user)" class="badge badge--warn">
    заблокирован до {{ formatDate(props.user.lockedUntil ?? "") }}
  </span>
  <span v-else-if="props.user.mustChangePassword" class="badge badge--warn">ждёт смены пароля</span>
  <span v-else class="badge badge--ok">активен</span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  padding: 2px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: 11px;
  white-space: nowrap;
}

.badge--ok {
  border-color: #3f5a3f;
  background: var(--success-bg);
  color: var(--success);
}

.badge--warn {
  border-color: var(--warning);
  background: var(--warning-bg);
  color: var(--warning);
}

.badge--danger {
  border-color: #6e2b28;
  background: var(--danger-bg);
  color: #ff8a80;
}
</style>
