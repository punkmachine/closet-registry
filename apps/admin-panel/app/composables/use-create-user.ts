import { type AssignableRole, newUserBodySchema } from "@closet/contract";
import type { Ref } from "vue";

interface CreateUserForm {
  username: Ref<string>;
  password: Ref<string>;
  role: Ref<AssignableRole>;
  busy: Ref<boolean>;
  error: Ref<string | null>;
  submit: () => Promise<void>;
}

/** Форма создания пользователя: проверка схемой контракта, запрос, очистка полей и `onCreated` (обновить список). */
export function useCreateUser(onCreated: () => void | Promise<void>): CreateUserForm {
  const { busy, error, run } = useAsyncAction();
  const username = ref("");
  const password = ref("");
  const role = ref<AssignableRole>("developer");

  async function submit(): Promise<void> {
    const parsed = newUserBodySchema.safeParse({
      username: username.value.trim(),
      password: password.value,
      role: role.value,
    });

    if (!parsed.success) {
      error.value = parsed.error.issues[0]?.message ?? "Некорректные данные";
      return;
    }

    if (!(await run(() => $fetch("/api/users", { method: "POST", body: parsed.data })))) {
      return;
    }

    username.value = "";
    password.value = "";
    await onCreated();
  }

  return { username, password, role, busy, error, submit };
}
