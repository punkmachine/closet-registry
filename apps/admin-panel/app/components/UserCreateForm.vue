<script setup lang="ts">
import { ASSIGNABLE_ROLES } from "@closet/contract";

const emit = defineEmits<{ created: [] }>();

const { username, password, role, busy, error, submit } = useCreateUser(() => {
  emit("created");
});
</script>

<template>
  <AppPanel title="Новый пользователь">
    <form class="form" @submit.prevent="submit">
      <div v-if="error" class="alert" role="alert">{{ error }}</div>

      <div class="grid">
        <div class="field">
          <label class="field__label" for="new-username">логин</label>
          <input id="new-username" v-model="username" class="input" autocomplete="off" placeholder="a-z, 0-9, . _ -" />
        </div>
        <div class="field">
          <label class="field__label" for="new-role">роль</label>
          <select id="new-role" v-model="role" class="input">
            <option v-for="item in ASSIGNABLE_ROLES" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>
      </div>

      <PasswordField v-model="password" label="временный пароль" generator :disabled="busy" />
      <p class="tiny dim">При первом входе пользователя попросят задать свой пароль.</p>

      <div>
        <button type="submit" class="btn" :disabled="busy || !username || !password">
          {{ busy ? "создаём…" : "Создать" }}
        </button>
      </div>
    </form>
  </AppPanel>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field__label {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
}

.input {
  width: 100%;
  padding: 8px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
}

.input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
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
