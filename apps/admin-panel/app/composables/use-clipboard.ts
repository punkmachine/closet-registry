import type { Ref } from "vue";

interface Clipboard {
  copied: Ref<boolean>;
  copy: (text: string) => Promise<boolean>;
}

/**
 * Копирование в буфер обмена. `copied` сбрасывается через `reset()` вручную; если буфер недоступен
 * (http, нет разрешения), `copy` возвращает `false`, и вызывающий показывает запасной вариант.
 */
export function useClipboard(): Clipboard & { reset: () => void } {
  const copied = ref(false);

  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      copied.value = true;
    } catch {
      copied.value = false;
    }

    return copied.value;
  }

  function reset(): void {
    copied.value = false;
  }

  return { copied, copy, reset };
}
