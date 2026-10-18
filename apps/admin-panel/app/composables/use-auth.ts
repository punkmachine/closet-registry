import type { MeResponse, PermissionAction, PermissionResource, User } from "@closet/contract";
import type { Ref } from "vue";

interface AuthState {
  user: Ref<User | null>;
  loaded: Ref<boolean>;
  fetchUser: () => Promise<User | null>;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  can: (resource: PermissionResource, action: PermissionAction) => boolean;
}

/**
 * Текущий пользователь админки. Токен сессии в JS недоступен (httpOnly), поэтому «вошёл ли я»
 * определяется запросом `/api/auth/me`; результат живёт в `useState` и переезжает с SSR на клиент.
 */
export function useAuth(): AuthState {
  const user = useState<User | null>("auth-user", () => null);
  const loaded = useState<boolean>("auth-loaded", () => false);

  /** Подтягивает пользователя; на SSR `useRequestFetch` пробрасывает cookie входящего запроса. */
  async function fetchUser(): Promise<User | null> {
    try {
      const response = await useRequestFetch()<MeResponse>("/api/auth/me");

      user.value = response.user;
    } catch {
      user.value = null;
    }
    loaded.value = true;

    return user.value;
  }

  async function login(username: string, password: string): Promise<User> {
    const response = await $fetch<MeResponse>("/api/auth/login", { method: "POST", body: { username, password } });

    user.value = response.user;
    loaded.value = true;

    return response.user;
  }

  async function logout(): Promise<void> {
    try {
      await $fetch("/api/auth/logout", { method: "POST" });
    } finally {
      user.value = null;
      await navigateTo("/login");
    }
  }

  function can(resource: PermissionResource, action: PermissionAction): boolean {
    return roleCan(user.value?.role, resource, action);
  }

  return { user, loaded, fetchUser, login, logout, can };
}
