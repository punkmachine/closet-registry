<script setup lang="ts">
const { currentPassword, newPassword, busy, error, submit } = useChangePassword();
</script>

<template>
  <AppPanel title="Смена пароля">
    <form class="form" @submit.prevent="submit">
      <div v-if="error" class="alert" role="alert">{{ error }}</div>

      <PasswordField
        v-model="currentPassword"
        label="текущий пароль"
        autocomplete="current-password"
        :disabled="busy"
      />
      <PasswordField v-model="newPassword" label="новый пароль" generator :disabled="busy" />

      <div>
        <button type="submit" class="btn" :disabled="busy || !currentPassword || !newPassword">
          {{ busy ? "сохраняем…" : "Сменить пароль" }}
        </button>
      </div>
      <p class="tiny dim">После смены остальные сессии этого аккаунта завершатся.</p>
    </form>
  </AppPanel>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.btn {
  padding: 7px 14px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #1b1008;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
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
