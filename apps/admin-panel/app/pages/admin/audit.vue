<script setup lang="ts">
definePageMeta({ permission: { resource: "users", action: "read" } });

const { entries, pending, error, hasMore, loadingMore, reload, loadMore } = await useAuditLog();
</script>

<template>
  <div class="audit">
    <div class="page-head">
      <h1>Аудит</h1>
      <button type="button" class="btn" :disabled="pending" @click="reload">обновить</button>
    </div>

    <div v-if="error" class="alert" role="alert">{{ error }}</div>

    <AppPanel flush>
      <AuditTable :entries="entries" />
    </AppPanel>

    <div v-if="hasMore">
      <button type="button" class="btn" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? "загружаем…" : "Показать ещё" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.audit {
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
