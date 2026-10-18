<script setup lang="ts">
import { PASSWORD_MIN_LENGTH, PASSWORD_SPECIAL_CHARS } from "@closet/contract";

interface Props {
  modelValue: string;
  label: string;
  autocomplete?: "new-password" | "current-password";
  generator?: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), { autocomplete: "new-password", generator: false, disabled: false });
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const visible = ref(false);
const id = useId();
const { copied, copy, reset } = useClipboard();

async function generate(): Promise<void> {
  const password = generatePassword();

  emit("update:modelValue", password);
  visible.value = true;
  reset();
  await copy(password);
}

function onInput(event: Event): void {
  reset();
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="field">
    <label class="field__label" :for="id">{{ props.label }}</label>
    <div class="field__row">
      <input
        :id="id"
        class="input input--mono"
        :type="visible ? 'text' : 'password'"
        :value="props.modelValue"
        :autocomplete="props.autocomplete"
        :disabled="props.disabled"
        spellcheck="false"
        @input="onInput"
      />
      <button type="button" class="btn btn--sm" @click="visible = !visible">{{ visible ? "скрыть" : "показать" }}</button>
      <button v-if="props.generator" type="button" class="btn btn--sm" :disabled="props.disabled" @click="generate">
        сгенерировать
      </button>
    </div>
    <p v-if="props.generator" class="tiny dim">
      Минимум {{ PASSWORD_MIN_LENGTH }} символов и один спецсимвол ({{ PASSWORD_SPECIAL_CHARS }}).
      <span v-if="copied" class="copied">Скопировано в буфер обмена.</span>
    </p>
  </div>
</template>

<style scoped>
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

.field__row {
  display: flex;
  gap: 6px;
}

.input {
  flex: 1;
  min-width: 0;
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

.input--mono {
  font-family: var(--font-mono);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

.copied {
  color: var(--success);
}
</style>
