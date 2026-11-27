import type { Entity, SyncRow } from "./types";

export interface HouseholdState {
  cursor: number;
  rows: Record<string, SyncRow>;
  pending: Record<string, SyncRow>;
}

export const emptyState = (): HouseholdState => ({ cursor: 0, rows: {}, pending: {} });

export function rowKey(entity: Entity, rowId: string): string {
  return `${entity}:${rowId}`;
}

export function applyLocalChange(state: HouseholdState, row: SyncRow): HouseholdState {
  const key = rowKey(row.entity, row.rowId);
  return {
    ...state,
    rows: { ...state.rows, [key]: row },
    pending: { ...state.pending, [key]: row },
  };
}

export function takePending(state: HouseholdState, max = 200): SyncRow[] {
  return Object.values(state.pending)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .slice(0, max);
}

export function applySyncResponse(
  state: HouseholdState,
  sent: SyncRow[],
  response: { cursor: number; rows: SyncRow[] },
): HouseholdState {
  const pending = { ...state.pending };
  for (const row of sent) {
    const key = rowKey(row.entity, row.rowId);
    if (pending[key]?.updatedAt === row.updatedAt) {
      delete pending[key];
    }
  }

  const rows = { ...state.rows };
  for (const row of response.rows) {
    const key = rowKey(row.entity, row.rowId);
    const localPending = pending[key];
    const localRow = rows[key];
    if (localPending && localPending.updatedAt > row.updatedAt) {
      continue;
    }
    if (localRow && localRow.updatedAt > row.updatedAt) {
      continue;
    }
    rows[key] = row;
  }

  return { cursor: response.cursor, rows, pending };
}
