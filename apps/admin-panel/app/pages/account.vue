<script setup lang="ts">
const { user } = useAuth();

const mustChange = computed(() => user.value?.mustChangePassword === true);
</script>

<template>
  <div class="account">
    <div class="page-head">
      <h1>Аккаунт</h1>
      <p class="page-head__sub">
        <span class="mono">{{ user?.username }}</span> · роль <span class="badge">{{ user?.role }}</span>
      </p>
    </div>

    <div v-if="mustChange" class="alert">
      Администратор задал временный пароль. Задайте свой — до этого остальные разделы недоступны.
    </div>

    <AccountPasswordPanel />
    <AccountTokenPanel v-if="!mustChange" />
  </div>
</template>

<style scoped>
.account {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 640px;
}

.page-head__sub {
  margin-top: 6px;
  color: var(--text-secondary);
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

.alert {
  padding: 11px 14px;
  border: 1px solid var(--warning);
  border-radius: var(--radius-sm);
  background: var(--warning-bg);
  font-size: 13px;
}
</style>
