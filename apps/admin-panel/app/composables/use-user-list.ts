import type { User, UserListResponse } from "@closet/contract";
import type { Ref } from "vue";

interface UserList {
  users: Ref<User[]>;
  pending: Ref<boolean>;
  error: Ref<string | null>;
  refresh: () => Promise<void>;
}

/** Список пользователей для страницы администрирования; ошибка загрузки приходит уже строкой. */
export async function useUserList(): Promise<UserList> {
  const { data, pending, error, refresh } = await useFetch<UserListResponse>("/api/users");

  return {
    users: computed(() => data.value?.users ?? []),
    pending,
    error: computed(() => (error.value ? errorMessage(error.value) : null)),
    refresh: () => refresh(),
  };
}
