import type { Ref } from "vue";

interface LoginForm {
  username: Ref<string>;
  password: Ref<string>;
  busy: Ref<boolean>;
  error: Ref<string | null>;
  submit: () => Promise<void>;
}

/**
 * Состояние и отправка формы входа. После успеха ведёт на главную, а при временном пароле — на `/account`.
 * Пароль очищается при любой ошибке, сообщение учитывает `account_locked` / `account_disabled`.
 */
export function useLogin(): LoginForm {
  const { user, login } = useAuth();
  const { busy, error, run } = useAsyncAction(loginFailureMessage);
  const username = ref("");
  const password = ref("");

  async function submit(): Promise<void> {
    const ok = await run(() => login(username.value.trim(), password.value));

    if (!ok) {
      password.value = "";
      return;
    }

    await navigateTo(user.value?.mustChangePassword ? "/account" : "/");
  }

  return { username, password, busy, error, submit };
}
