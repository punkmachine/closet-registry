<script setup lang="ts">
definePageMeta({ layout: "auth", public: true });

const { username, password, busy, error, submit } = useLogin();
</script>

<template>
  <form class="login panel" @submit.prevent="submit">
    <div class="login__brand">
      <span class="login__mark">◇</span>
      closet<span class="dim">-registry</span>
    </div>

    <div v-if="error" class="alert" role="alert">{{ error }}</div>

    <div class="field">
      <label class="field__label" for="login-username">логин</label>
      <input
        id="login-username"
        v-model="username"
        class="input"
        autocomplete="username"
        autofocus
        required
      />
    </div>

    <div class="field">
      <label class="field__label" for="login-password">пароль</label>
      <input
        id="login-password"
        v-model="password"
        class="input"
        type="password"
        autocomplete="current-password"
        required
      />
    </div>

    <button type="submit" class="btn" :disabled="busy || !username || !password">
      {{ busy ? "входим…" : "Войти" }}
    </button>
  </form>
</template>

<style scoped>
.login {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 360px;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card-bg);
}

.login__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #e6edf3;
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 600;
}

.login__mark {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--accent-light);
  color: var(--accent);
  font-size: 13px;
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
  font-family: var(--font-mono);
  font-size: 13px;
}

.input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.btn {
  padding: 8px 14px;
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
