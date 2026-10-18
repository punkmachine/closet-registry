<script setup lang="ts">
import type { User } from "@closet/contract";
import { ConfirmDialog } from "@closet/ui";

definePageMeta({ permission: { resource: "users", action: "read" } });

const { user: me } = useAuth();
const { users, pending, error, refresh } = await useUserList();
const actions = useUserActions(refresh);

const resetTarget = ref<User | null>(null);
const deleteTarget = ref<User | null>(null);

async function onReset(password: string): Promise<void> {
  if (resetTarget.value && (await actions.resetPassword(resetTarget.value, password))) {
    resetTarget.value = null;
  }
}

async function onDelete(): Promise<void> {
  if (deleteTarget.value && (await actions.remove(deleteTarget.value))) {
    deleteTarget.value = null;
  }
}
</script>

<template>
  <div class="users">
    <div class="page-head">
      <h1>Пользователи</h1>
      <button type="button" class="btn" :disabled="pending" @click="refresh()">обновить</button>
    </div>

    <div v-if="error ?? actions.error.value" class="alert" role="alert">{{ error ?? actions.error.value }}</div>

    <UserCreateForm @created="refresh()" />

    <AppPanel flush>
      <UsersTable
        :users="users"
        :current-user-id="me?.id"
        :busy-id="actions.busyId.value"
        @role="(user, role) => actions.patch(user, { role })"
        @toggle-disabled="(user) => actions.patch(user, { disabled: !user.disabled })"
        @unlock="(user) => actions.patch(user, { unlock: true })"
        @reset="(user) => (resetTarget = user)"
        @remove="(user) => (deleteTarget = user)"
      />
    </AppPanel>

    <UserResetPasswordDialog
      :user="resetTarget"
      :busy="actions.busyId.value !== null"
      :error="actions.error.value"
      @submit="onReset"
      @cancel="resetTarget = null"
    />

    <ConfirmDialog
      :open="deleteTarget !== null"
      :title="`Удалить пользователя ${deleteTarget?.username ?? ''}?`"
      message="Доступ пропадёт сразу, сессии и токен будут отозваны. Плагины пользователя останутся, имя автора сохранится."
      confirm-label="Удалить пользователя"
      :confirm-phrase="deleteTarget?.username ?? null"
      :busy="actions.busyId.value !== null"
      @confirm="onDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>

<style scoped>
.users {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
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
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.alert {
  padding: 11px 14px;
  border: 1px solid #6e2b28;
  border-radius: var(--radius-sm);
  background: var(--danger-bg);
  color: #ffb3ab;
  font-size: 13px;
}
</style>
