import type { Ref } from "vue";

interface AsyncAction {
  busy: Ref<boolean>;
  error: Ref<string | null>;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
}

/**
 * Обёртка над мутацией: выставляет `busy`, превращает исключение в текст `error` (`errorMessage` или свой `describe`)
 * и возвращает `true`, если действие выполнилось без ошибки.
 */
export function useAsyncAction(describe: (failure: unknown) => string = errorMessage): AsyncAction {
  const busy = ref(false);
  const error = ref<string | null>(null);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    busy.value = true;
    error.value = null;

    try {
      await action();
      return true;
    } catch (error_) {
      error.value = describe(error_);
      return false;
    } finally {
      busy.value = false;
    }
  }

  return { busy, error, run };
}
