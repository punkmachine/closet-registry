import type { ApiToken, ApiTokenIssued, ApiTokenResponse } from "@closet/contract";
import type { Ref } from "vue";

interface ApiTokenState {
  token: Ref<ApiToken | null>;
  issued: Ref<ApiTokenIssued | null>;
  busy: Ref<boolean>;
  error: Ref<string | null>;
  copied: Ref<boolean>;
  issue: () => Promise<void>;
  revoke: () => Promise<boolean>;
  copyIssued: () => Promise<void>;
}

/**
 * Персональный API-токен текущего пользователя: метаданные, выпуск/перевыпуск, отзыв и копирование
 * только что выпущенного значения (оно приходит один раз). Метаданные грузятся на клиенте.
 * Пока пароль временный, реестр отвечает на токен-эндпоинты 403, поэтому хук вызывают только после смены пароля.
 */
export function useApiToken(): ApiTokenState {
  const {
    data,
    error: loadError,
    refresh,
  } = useFetch<ApiTokenResponse>("/api/auth/token", {
    server: false,
  });
  const { busy, error, run } = useAsyncAction();
  const { copied, copy, reset } = useClipboard();
  const issued = ref<ApiTokenIssued | null>(null);

  const token = computed(() => data.value?.token ?? null);
  const shownError = computed({
    get: () => error.value ?? (loadError.value ? errorMessage(loadError.value) : null),
    set: (value) => {
      error.value = value;
    },
  });

  async function issue(): Promise<void> {
    reset();

    if (await run(async () => (issued.value = await $fetch<ApiTokenIssued>("/api/auth/token", { method: "POST" })))) {
      await refresh();
    }
  }

  async function revoke(): Promise<boolean> {
    const ok = await run(() => $fetch("/api/auth/token", { method: "DELETE" }));

    if (ok) {
      issued.value = null;
      await refresh();
    }

    return ok;
  }

  async function copyIssued(): Promise<void> {
    if (issued.value && !(await copy(issued.value.value))) {
      shownError.value = "Не удалось скопировать — выделите токен и скопируйте вручную";
    }
  }

  return { token, issued, busy, error: shownError, copied, issue, revoke, copyIssued };
}
