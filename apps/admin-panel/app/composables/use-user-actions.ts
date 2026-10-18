import type { AssignableRole, User } from "@closet/contract";
import type { Ref } from "vue";

interface UserPatch {
  role?: AssignableRole;
  disabled?: boolean;
  unlock?: true;
}

const userUrl = (user: User): string => `/api/users/${encodeURIComponent(user.id)}`;

interface UserActions {
  busyId: Ref<string | null>;
  error: Ref<string | null>;
  patch: (user: User, body: UserPatch) => Promise<boolean>;
  resetPassword: (user: User, password: string) => Promise<boolean>;
  remove: (user: User) => Promise<boolean>;
}

/**
 * Мутации над существующим пользователем (роль, блокировка, сброс пароля, удаление).
 * `busyId` — id юзера, над которым идёт запрос; список перечитывается через `refresh` после каждого действия,
 * в том числе неудачного, чтобы таблица не расходилась с реестром.
 */
export function useUserActions(refresh: () => Promise<void>): UserActions {
  const { error, run } = useAsyncAction();
  const busyId = ref<string | null>(null);

  async function act(user: User, action: () => Promise<unknown>): Promise<boolean> {
    busyId.value = user.id;

    const ok = await run(action);

    busyId.value = null;
    await refresh();

    return ok;
  }

  return {
    busyId,
    error,
    patch: (user, body) => act(user, () => $fetch(userUrl(user), { method: "PATCH", body })),
    resetPassword: (user, password) =>
      act(user, () => $fetch(`${userUrl(user)}/reset-password`, { method: "POST", body: { password } })),
    remove: (user) => act(user, () => $fetch(userUrl(user), { method: "DELETE" })),
  };
}
