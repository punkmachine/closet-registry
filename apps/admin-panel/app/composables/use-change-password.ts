import { changePasswordBodySchema } from "@closet/contract";
import type { Ref } from "vue";

interface ChangePasswordForm {
  currentPassword: Ref<string>;
  newPassword: Ref<string>;
  busy: Ref<boolean>;
  error: Ref<string | null>;
  submit: () => Promise<void>;
}

/**
 * Форма смены пароля: клиентская проверка схемой контракта, запрос, затем обновление пользователя
 * (снимается `mustChangePassword`) и переход на главную.
 */
export function useChangePassword(): ChangePasswordForm {
  const { fetchUser } = useAuth();
  const { busy, error, run } = useAsyncAction();
  const currentPassword = ref("");
  const newPassword = ref("");

  async function submit(): Promise<void> {
    const parsed = changePasswordBodySchema.safeParse({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    });

    if (!parsed.success) {
      error.value = parsed.error.issues[0]?.message ?? "Некорректный пароль";
      return;
    }

    const ok = await run(() => $fetch("/api/auth/change-password", { method: "POST", body: parsed.data }));

    if (!ok) {
      return;
    }

    currentPassword.value = "";
    newPassword.value = "";
    await fetchUser();
    await navigateTo("/");
  }

  return { currentPassword, newPassword, busy, error, submit };
}
