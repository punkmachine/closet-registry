<script setup lang="ts">
import { ConfirmDialog, formatDate } from "@closet/ui";

const { token, issued, busy, error, copied, issue, revoke, copyIssued } = useApiToken();

const revokeOpen = ref(false);

async function confirmRevoke(): Promise<void> {
  if (await revoke()) {
    revokeOpen.value = false;
  }
}
</script>

<template>
  <AppPanel title="API-токен для closet-cli">
    <div v-if="error" class="alert alert--error" role="alert">{{ error }}</div>

    <div v-if="issued" class="alert alert--ok">
      <strong>Новый токен показывается один раз — сохраните его сейчас.</strong>
      <code class="token">{{ issued.value }}</code>
      <div>
        <button type="button" class="btn btn--sm" @click="copyIssued">
          {{ copied ? "скопировано" : "копировать" }}
        </button>
      </div>
    </div>

    <dl v-if="token" class="meta-list">
      <dt>токен</dt>
      <dd class="mono">{{ token.prefix }}…</dd>
      <dt>выпущен</dt>
      <dd>{{ formatDate(token.createdAt) }}</dd>
      <dt>использован</dt>
      <dd>{{ token.lastUsedAt ? formatDate(token.lastUsedAt) : "ещё не использовался" }}</dd>
    </dl>
    <p v-else class="dim">Токен не выпущен.</p>

    <div class="row">
      <button type="button" class="btn btn--primary" :disabled="busy" @click="issue">
        {{ token ? "Перевыпустить" : "Выпустить токен" }}
      </button>
      <button v-if="token" type="button" class="btn btn--danger" :disabled="busy" @click="revokeOpen = true">
        Отозвать
      </button>
    </div>
    <p class="tiny dim">
      Токен кладётся в <code>closet-cli.json</code> (поле <code>token</code>) — не коммитьте его. Перевыпуск отзывает
      прежний токен.
    </p>

    <ConfirmDialog
      :open="revokeOpen"
      title="Отозвать токен?"
      message="closet-cli с этим токеном перестанет получать доступ к реестру."
      confirm-label="Отозвать"
      :busy="busy"
      @confirm="confirmRevoke"
      @cancel="revokeOpen = false"
    />
  </AppPanel>
</template>

<style scoped>
.btn {
  padding: 7px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
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

.btn--sm {
  padding: 4px 9px;
  font-size: 12px;
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

.btn--danger {
  border-color: #6e2b28;
  background: var(--danger-bg);
  color: #ff8a80;
}

.alert {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 11px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.alert--error {
  border-color: #6e2b28;
  background: var(--danger-bg);
  color: #ffb3ab;
}

.alert--ok {
  border-color: #3f5a3f;
  background: var(--success-bg);
}

.token {
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  overflow-wrap: anywhere;
  user-select: all;
}

.meta-list {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 14px;
  margin: 0;
  font-size: 12.5px;
}

.meta-list dt {
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

.meta-list dd {
  margin: 0;
}
</style>
