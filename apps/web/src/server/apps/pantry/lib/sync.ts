import { ApiError } from "../../../shared/errors";

export const SYNC_ENTITIES = ["recipe", "pantry_item", "grocery_list", "grocery_item"] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export interface SyncRow {
  entity: SyncEntity;
  rowId: string;
  data: Record<string, unknown>;
  deleted: boolean;
  updatedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ROWS = 200;
const MAX_DATA_BYTES = 20_000;
const MAX_FUTURE_MS = 5 * 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// shortcut: last write wins on client clocks, so a skewed clock can lose edits; move to server-assigned or hybrid logical clocks if households report lost edits.
export function parseSyncRequest(
  body: unknown,
  now: number = Date.now(),
): { cursor: number; rows: SyncRow[] } {
  if (!isRecord(body)) throw new ApiError(400, "Invalid sync request.");

  const cursor = body.cursor === undefined ? 0 : body.cursor;
  if (typeof cursor !== "number" || !Number.isSafeInteger(cursor) || cursor < 0) {
    throw new ApiError(400, "Invalid sync cursor.");
  }

  const rawRows = body.rows === undefined ? [] : body.rows;
  if (!Array.isArray(rawRows)) throw new ApiError(400, "Invalid sync rows.");
  if (rawRows.length > MAX_ROWS) throw new ApiError(400, "Too many sync rows.");

  const rows: SyncRow[] = [];
  const latest = new Map<string, { index: number; updatedAt: number }>();
  for (const value of rawRows) {
    if (!isRecord(value)) throw new ApiError(400, "Invalid sync row.");

    if (typeof value.entity !== "string" || !SYNC_ENTITIES.includes(value.entity as SyncEntity)) {
      throw new ApiError(400, "Invalid sync entity.");
    }
    if (typeof value.rowId !== "string" || !UUID.test(value.rowId)) {
      throw new ApiError(400, "Invalid sync row ID.");
    }
    if (!isPlainObject(value.data)) throw new ApiError(400, "Invalid sync row data.");
    let serialized: string;
    try {
      serialized = JSON.stringify(value.data);
    } catch {
      throw new ApiError(400, "Invalid sync row data.");
    }
    if (serialized.length > MAX_DATA_BYTES) throw new ApiError(400, "Sync row data is too large.");

    const deleted = value.deleted === undefined ? false : value.deleted;
    if (typeof deleted !== "boolean") throw new ApiError(400, "Invalid sync row deleted flag.");

    const updatedAt = typeof value.updatedAt === "string" ? Date.parse(value.updatedAt) : NaN;
    if (!Number.isFinite(updatedAt) || updatedAt > now + MAX_FUTURE_MS) {
      throw new ApiError(400, "Invalid sync row update time.");
    }

    const key = `${value.entity}\u0000${value.rowId}`;
    const existing = latest.get(key);
    if (existing && existing.updatedAt > updatedAt) continue;

    const row: SyncRow = {
      entity: value.entity as SyncEntity,
      rowId: value.rowId,
      data: value.data,
      deleted,
      updatedAt: new Date(updatedAt).toISOString(),
    };
    if (existing) {
      rows[existing.index] = row;
      existing.updatedAt = updatedAt;
    } else {
      latest.set(key, { index: rows.length, updatedAt });
      rows.push(row);
    }
  }
  return { cursor, rows };
}
