<script setup lang="ts">
import { computed, ref, watch } from "vue";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmPhrase?: string | null;
  busy?: boolean;
}

interface Emits {
  confirm: [];
  cancel: [];
}

const props = withDefaults(defineProps<Props>(), {
  confirmLabel: "Удалить",
  confirmPhrase: null,
  busy: false,
});

const emit = defineEmits<Emits>();

const typed = ref("");
const canConfirm = computed(() => !props.busy && (!props.confirmPhrase || typed.value === props.confirmPhrase));

watch(
  () => props.open,
  (open) => {
    if (open) {
      typed.value = "";
    }
  },
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.open"
      class="modal-backdrop"
      @click.self="emit('cancel')"
    >
      <dialog
        class="modal"
        open
      >
        <section class="modal__body stack">
          <h2>{{ props.title }}</h2>
          <p class="muted">{{ props.message }}</p>

          <div
            v-if="props.confirmPhrase"
            class="field"
          >
            <label class="field__label">
              введите <code>{{ props.confirmPhrase }}</code> для подтверждения
            </label>
            <input
              v-model="typed"
              class="input input--mono"
              autofocus
              @keydown.enter="canConfirm && emit('confirm')"
            />
          </div>
        </section>

        <footer class="modal__foot">
          <button
            type="button"
            class="btn"
            :disabled="props.busy"
            @click="emit('cancel')"
          >
            Отмена
          </button>
          <button
            type="button"
            class="btn btn--danger"
            :disabled="!canConfirm"
            @click="emit('confirm')"
          >
            <span
              v-if="props.busy"
              class="spinner"
            />
            {{ props.confirmLabel }}
          </button>
        </footer>
      </dialog>
    </div>
  </Teleport>
</template>

<!-- TODO: цвета все в переменные -->
<!-- TODO: z-index все в переменные -->
<style scoped>
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

.btn--danger {
  border-color: #6e2b28;
  background: var(--danger-bg);
  color: #ff8a80;
}

.btn--danger:hover:not(:disabled) {
  background: #f8514933;
  border-color: var(--danger);
  color: #ffb3ab;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
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
  transition:
    border-color 0.12s ease,
    box-shadow 0.12s ease;
}

.input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.input--mono {
  font-family: var(--font-mono);
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #ffffff26;
  border-top-color: var(--accent);
  border-radius: 999px;
  animation: spin 0.7s linear infinite;
  flex: none;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 24px;
  background: #010409b8;
  backdrop-filter: blur(3px);
}

.modal {
  position: static;
  margin: 0;
  padding: 0;
  color: inherit;
  width: 100%;
  max-width: 440px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-pop);
  overflow: hidden;
}

.modal__body {
  padding: 18px;
}

.modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}
</style>
