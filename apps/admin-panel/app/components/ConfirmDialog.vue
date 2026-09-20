<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    /** Точный текст, который нужно ввести для подтверждения (для необратимых действий). */
    confirmPhrase?: string | null;
    busy?: boolean;
  }>(),
  { confirmLabel: "Удалить", confirmPhrase: null, busy: false },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();

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
    <div v-if="props.open" class="modal-backdrop" @click.self="emit('cancel')">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__body stack">
          <h2>{{ props.title }}</h2>
          <p class="muted">{{ props.message }}</p>

          <div v-if="props.confirmPhrase" class="field">
            <label class="field__label">
              введите <code>{{ props.confirmPhrase }}</code> для подтверждения
            </label>
            <input v-model="typed" class="input input--mono" autofocus @keydown.enter="canConfirm && emit('confirm')" />
          </div>
        </div>

        <div class="modal__foot">
          <button type="button" class="btn" :disabled="props.busy" @click="emit('cancel')">Отмена</button>
          <button type="button" class="btn btn--danger" :disabled="!canConfirm" @click="emit('confirm')">
            <span v-if="props.busy" class="spinner" />
            {{ props.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
