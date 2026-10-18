<script setup lang="ts">
/**
 * Статус реестра в шапке: админка бесполезна без бэкенда, и «ничего не грузится» должно
 * сразу читаться как «реестр недоступен», а не как пустой список плагинов.
 */
const { data: health } = useFetch("/api/health", { lazy: true, server: false });

const { user, can, logout } = useAuth();

const registryState = computed(() => {
  if (!health.value) {
    return { cls: "", label: "проверяем реестр…" };
  }

  if (health.value.registry !== "ok") {
    return { cls: "dot--err", label: "реестр недоступен" };
  }

  if (health.value.registryDb !== "ok") {
    return { cls: "dot--warn", label: "реестр без БД" };
  }

  return { cls: "dot--ok", label: "реестр на связи" };
});
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <div class="container topbar__inner">
        <NuxtLink to="/" class="brand">
          <span class="brand__mark">◇</span>
          closet<span class="brand__muted">-registry</span>
        </NuxtLink>

        <span class="topbar__spacer" />

        <span class="badge" :title="health?.registryUrl">
          <span class="dot" :class="registryState.cls" />
          {{ registryState.label }}
        </span>

        <NuxtLink v-if="can('plugins', 'write')" to="/plugins/new" class="btn btn--primary btn--sm">
          + новый плагин
        </NuxtLink>

        <template v-if="user">
          <NuxtLink v-if="can('users', 'read')" to="/admin/users" class="nav-link">пользователи</NuxtLink>
          <NuxtLink v-if="can('users', 'read')" to="/admin/audit" class="nav-link">аудит</NuxtLink>
          <NuxtLink to="/account" class="nav-link" :title="`роль: ${user.role}`">
            {{ user.username }} <span class="badge">{{ user.role }}</span>
          </NuxtLink>
          <button type="button" class="btn btn--sm" @click="logout">выйти</button>
        </template>
      </div>
    </header>

    <main class="page">
      <div class="container">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.container {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 24px;
}

.page {
  flex: 1;
  padding: 32px 0 64px;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid var(--border);
  background: #0d1117e6;
  backdrop-filter: blur(12px);
}

.topbar__inner {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 56px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #e6edf3;
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
}

.brand:hover {
  color: #e6edf3;
}

.brand__mark {
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

.brand__muted {
  color: var(--text-tertiary);
  font-weight: 400;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 12px;
}

.nav-link:hover,
.nav-link.router-link-active {
  color: #e6edf3;
}

.topbar__spacer {
  flex: 1;
}

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

.dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--text-tertiary);
  flex: none;
}

.dot--ok {
  background: var(--success);
  box-shadow: 0 0 0 3px var(--success-bg);
}

.dot--warn {
  background: var(--warning);
  box-shadow: 0 0 0 3px var(--warning-bg);
}

.dot--err {
  background: var(--danger);
  box-shadow: 0 0 0 3px var(--danger-bg);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 7px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
  white-space: nowrap;
}

.btn:hover:not(:disabled) {
  background: var(--surface-3);
  border-color: #4a525c;
  color: #e6edf3;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #1b1008;
  font-weight: 600;
}

.btn--primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: #1b1008;
}

.btn--sm {
  padding: 4px 9px;
  font-size: 12px;
}
</style>
