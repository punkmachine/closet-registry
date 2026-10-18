import type { AuditEntry, AuditListResponse } from "@closet/contract";
import type { Ref } from "vue";

const PAGE_SIZE = 50;

interface AuditLog {
  entries: Ref<AuditEntry[]>;
  pending: Ref<boolean>;
  error: Ref<string | null>;
  hasMore: Ref<boolean>;
  loadingMore: Ref<boolean>;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
}

/**
 * Журнал аудита с подгрузкой «вперёд» (к более старым записям) по курсору `before`.
 * Первая страница живёт в `useFetch` и обновляется `reload`, остальные дописываются в хвост.
 */
export async function useAuditLog(): Promise<AuditLog> {
  const { data, pending, error, refresh } = await useFetch<AuditListResponse>("/api/audit", {
    query: { limit: PAGE_SIZE },
  });
  const { busy: loadingMore, error: moreError, run } = useAsyncAction();
  const older = ref<AuditEntry[]>([]);
  const exhausted = ref(false);

  const entries = computed(() => [...(data.value?.entries ?? []), ...older.value]);
  const hasMore = computed(() => !exhausted.value && (data.value?.entries.length ?? 0) >= PAGE_SIZE);

  async function reload(): Promise<void> {
    older.value = [];
    exhausted.value = false;
    await refresh();
  }

  async function loadMore(): Promise<void> {
    const last = entries.value.at(-1);

    if (!last) {
      return;
    }

    await run(async () => {
      const page = await $fetch<AuditListResponse>("/api/audit", { query: { limit: PAGE_SIZE, before: last.id } });

      older.value.push(...page.entries);
      exhausted.value = page.entries.length < PAGE_SIZE;
    });
  }

  return {
    entries,
    pending,
    error: computed(() => moreError.value ?? (error.value ? errorMessage(error.value) : null)),
    hasMore,
    loadingMore,
    reload,
    loadMore,
  };
}
