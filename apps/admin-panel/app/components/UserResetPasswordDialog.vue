<script setup lang="ts">
import { resetPasswordBodySchema, type User } from "@closet/contract";

interface Props {
  user: User | null;
  busy: boolean;
  error?: string | null;
}

const props = withDefaults(defineProps<Props>(), { error: null });
const emit = defineEmits<{ submit: [password: string]; cancel: [] }>();

const password = ref("");
const localError = ref<string | null>(null);

watch(
  () => props.user,
  () => {
    password.value = "";
    localError.value = null;
  },
);

function onSubmit(): void {
  const parsed = resetPasswordBodySchema.safeParse({ password: password.value });

  if (parsed.success) {
    localError.value = null;
    emit("submit", parsed.data.password);
  } else {
    localError.value = parsed.error.issues[0]?.message ?? "Некорректный пароль";
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="props.user" class="backdrop" @click.self="emit('cancel')">
      <form class="modal" @submit.prevent="onSubmit">
        <h2>Сброс пароля: {{ props.user.username }}</h2>
        <p class="muted">Все сессии и токен пользователя будут отозваны, при входе он должен задать свой пароль.</p>
        <div v-if="localError ?? props.error" class="alert" role="alert">{{ localError ?? props.error }}</div>
        <PasswordField v-model="password" label="временный пароль" generator />
        <div class="foot">
          <button type="button" class="btn" @click="emit('cancel')">Отмена</button>
          <button type="submit" class="btn btn--primary" :disabled="!password || props.busy">Сбросить</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: #010409b3;
}

.modal {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 460px;
  padding: 20px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-pop);
}

.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

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
}

.btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #1b1008;
  font-weight: 600;
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
