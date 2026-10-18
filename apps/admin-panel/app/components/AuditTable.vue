<script setup lang="ts">
import type { AuditEntry } from "@closet/contract";
import { formatDate } from "@closet/ui";

const props = defineProps<{ entries: AuditEntry[] }>();

function target(entry: AuditEntry): string {
  return entry.targetType ? `${entry.targetType}${entry.targetId ? ` · ${entry.targetId}` : ""}` : "—";
}
</script>

<template>
  <table class="table">
    <thead>
      <tr>
        <th>время</th>
        <th>кто</th>
        <th>действие</th>
        <th>объект</th>
        <th>детали</th>
        <th>ip</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="entry in props.entries" :key="entry.id">
        <td class="tiny dim nowrap">{{ formatDate(entry.createdAt) }}</td>
        <td class="mono">{{ entry.actorUsername ?? "—" }}</td>
        <td class="mono">{{ entry.action }}</td>
        <td class="tiny nowrap">{{ target(entry) }}</td>
        <td class="tiny dim details">{{ entry.details ? JSON.stringify(entry.details) : "" }}</td>
        <td class="tiny dim mono">{{ entry.ip ?? "—" }}</td>
      </tr>
      <tr v-if="props.entries.length === 0">
        <td colspan="6" class="dim">Записей нет</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table th {
  padding: 10px 14px;
  text-align: left;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: var(--surface-2);
}

.table td {
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  vertical-align: top;
}

.details {
  max-width: 360px;
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
}
</style>
