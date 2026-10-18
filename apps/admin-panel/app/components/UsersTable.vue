<script setup lang="ts">
import { ASSIGNABLE_ROLES, type AssignableRole, type User } from "@closet/contract";
import { formatDate } from "@closet/ui";
import { isUserLocked } from "~/utils/permissions";

interface Props {
  users: User[];
  currentUserId?: string;
  busyId: string | null;
}

const props = withDefaults(defineProps<Props>(), { currentUserId: "" });

const emit = defineEmits<{
  role: [user: User, role: AssignableRole];
  toggleDisabled: [user: User];
  unlock: [user: User];
  reset: [user: User];
  remove: [user: User];
}>();

function onRoleChange(user: User, event: Event): void {
  emit("role", user, (event.target as HTMLSelectElement).value as AssignableRole);
}
</script>

<template>
  <table class="table">
    <thead>
      <tr>
        <th>логин</th>
        <th>роль</th>
        <th>статус</th>
        <th>последний вход</th>
        <th />
      </tr>
    </thead>
    <tbody>
      <tr v-for="item in props.users" :key="item.id">
        <td class="mono">
          {{ item.username }}
          <span v-if="item.id === props.currentUserId" class="badge badge--muted">это вы</span>
        </td>
        <td>
          <span v-if="item.role === 'admin' || item.id === props.currentUserId" class="badge">{{ item.role }}</span>
          <select
            v-else
            class="select"
            :value="item.role"
            :disabled="props.busyId === item.id"
            @change="onRoleChange(item, $event)"
          >
            <option v-for="role in ASSIGNABLE_ROLES" :key="role" :value="role">{{ role }}</option>
          </select>
        </td>
        <td><UserStatusBadge :user="item" /></td>
        <td class="tiny dim nowrap">{{ item.lastLoginAt ? formatDate(item.lastLoginAt) : "—" }}</td>
        <td class="actions">
          <button
            v-if="isUserLocked(item)"
            type="button"
            class="btn"
            :disabled="props.busyId === item.id"
            @click="emit('unlock', item)"
          >
            разблокировать
          </button>
          <button
            v-if="item.id !== props.currentUserId"
            type="button"
            class="btn"
            :disabled="props.busyId === item.id"
            @click="emit('toggleDisabled', item)"
          >
            {{ item.disabled ? "включить" : "отключить" }}
          </button>
          <button type="button" class="btn" :disabled="props.busyId === item.id" @click="emit('reset', item)">
            сбросить пароль
          </button>
          <button
            v-if="item.id !== props.currentUserId"
            type="button"
            class="btn btn--danger"
            :disabled="props.busyId === item.id"
            @click="emit('remove', item)"
          >
            удалить
          </button>
        </td>
      </tr>
      <tr v-if="props.users.length === 0">
        <td colspan="5" class="dim">Пользователей нет</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table th {
  padding: 10px 14px;
  text-align: left;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: var(--surface-2);
}

.table td {
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  vertical-align: middle;
}

.actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.badge {
  display: inline-flex;
  padding: 2px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
}

.badge--muted {
  color: var(--text-tertiary);
}

.select {
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
}

.btn {
  padding: 4px 9px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.btn:hover:not(:disabled) {
  background: var(--surface-3);
  color: #e6edf3;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--danger {
  border-color: #6e2b28;
  background: var(--danger-bg);
  color: #ff8a80;
}
</style>
