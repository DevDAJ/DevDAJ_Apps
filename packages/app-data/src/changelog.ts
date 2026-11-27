import { isValidAppName, type SqlValue } from "./shared";

const MAX_WALL = 10 ** 15 - 1;
const MAX_COUNTER = 36 ** 4 - 1;
const DEVICE = /^[A-Za-z0-9_]{1,64}$/;
const IDENTIFIER = /^[a-z_][a-z0-9_]{0,63}$/;
const ENCODED_HLC = /^(\d{15})-([0-9a-z]{4})-([A-Za-z0-9_]{1,64})$/;

/** A logical timestamp: wall milliseconds, a counter and the writing device. */
export interface Hlc {
  /** Milliseconds since the epoch, integer >= 0. */
  wall: number;
  /** Ticks within the same wall millisecond, 0 through 36**4 - 1. */
  counter: number;
  /** Device id: 1 to 64 characters of [A-Za-z0-9_]. */
  device: string;
}

function assertDevice(device: unknown): asserts device is string {
  if (typeof device !== "string" || !DEVICE.test(device)) {
    throw new Error("Invalid HLC device: expected 1 to 64 characters of [A-Za-z0-9_]");
  }
}

function assertNow(nowMs: unknown): asserts nowMs is number {
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs) || nowMs < 0) {
    throw new Error("Invalid HLC time: nowMs must be finite and non-negative");
  }
}

function assertHlc(hlc: unknown, name: string): asserts hlc is Hlc {
  if (typeof hlc !== "object" || hlc === null) throw new Error(`Invalid HLC ${name}`);
  const value = hlc as Record<string, unknown>;
  if (
    typeof value.wall !== "number" ||
    !Number.isInteger(value.wall) ||
    value.wall < 0 ||
    value.wall > MAX_WALL
  ) {
    throw new Error(`Invalid HLC ${name}: bad wall`);
  }
  if (
    typeof value.counter !== "number" ||
    !Number.isInteger(value.counter) ||
    value.counter < 0 ||
    value.counter > MAX_COUNTER
  ) {
    throw new Error(`Invalid HLC ${name}: bad counter`);
  }
  assertDevice(value.device);
}

function assertNoOverflow(counter: number): void {
  if (counter > MAX_COUNTER) throw new Error("HLC counter overflow");
}

/** Advances the clock for a local event, keeping wall time monotonic. */
export function hlcTick(prev: Hlc | null, nowMs: number, device: string): Hlc {
  assertDevice(device);
  assertNow(nowMs);
  if (prev !== null) assertHlc(prev, "prev");
  const wall = Math.max(prev?.wall ?? 0, Math.floor(nowMs));
  if (!Number.isInteger(wall) || wall > MAX_WALL)
    throw new Error("Invalid HLC time: wall out of range");
  const counter = wall === prev?.wall ? prev.counter + 1 : 0;
  assertNoOverflow(counter);
  return { wall, counter, device };
}

/** Joins a remote clock with the local one for an incoming event. */
export function hlcReceive(local: Hlc, remote: Hlc, nowMs: number): Hlc {
  // shortcut: no clock-drift guard; a device with a far-future clock wins every field until real time catches up. Add a max-drift check in hlcReceive if this shows up.
  assertHlc(local, "local");
  assertHlc(remote, "remote");
  assertNow(nowMs);
  const wall = Math.max(local.wall, remote.wall, Math.floor(nowMs));
  const counter =
    wall === local.wall && wall === remote.wall
      ? Math.max(local.counter, remote.counter) + 1
      : wall === local.wall
        ? local.counter + 1
        : wall === remote.wall
          ? remote.counter + 1
          : 0;
  assertNoOverflow(counter);
  return { wall, counter, device: local.device };
}

/** Encodes an HLC as a lexicographically sortable string. */
export function encodeHlc(h: Hlc): string {
  assertHlc(h, "hlc");
  return `${String(h.wall).padStart(15, "0")}-${h.counter.toString(36).padStart(4, "0")}-${h.device}`;
}

/** Decodes a strict encoded HLC string, rejecting anything else. */
export function decodeHlc(s: string): Hlc {
  if (typeof s !== "string") throw new Error("Invalid HLC");
  const match = ENCODED_HLC.exec(s);
  if (!match) throw new Error("Invalid HLC");
  const wall = Number(match[1]);
  const counter = parseInt(match[2], 36);
  if (
    !Number.isInteger(wall) ||
    wall > MAX_WALL ||
    !Number.isInteger(counter) ||
    counter > MAX_COUNTER
  ) {
    throw new Error("Invalid HLC");
  }
  return { wall, counter, device: match[3] };
}

/** Compares two encoded HLC strings by causal order. */
export function compareHlc(a: string, b: string): number {
  decodeHlc(a);
  decodeHlc(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** One replicated change, supplied by the caller and carried after decryption. */
export type Operation =
  | {
      id: string;
      hlc: string;
      app: string;
      table: string;
      row: string;
      kind: "set";
      fields: Record<string, SqlValue>;
    }
  | {
      id: string;
      hlc: string;
      app: string;
      table: string;
      row: string;
      kind: "increment";
      field: string;
      by: number;
    }
  | { id: string; hlc: string; app: string; table: string; row: string; kind: "delete" }
  | { id: string; hlc: string; app: string; kind: "purge_app" };

function invalid(reason: string): Error {
  return new Error(`Invalid operation: ${reason}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, reason: string): string {
  if (typeof value !== "string" || value.length === 0) throw invalid(reason);
  return value;
}

function identifier(value: unknown, reason: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw invalid(reason);
  return value;
}

function sqlValue(value: unknown): SqlValue {
  if (value === null || typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw invalid("bad field value");
}

function encodedHlc(value: unknown): string {
  if (typeof value !== "string") throw invalid("bad hlc");
  try {
    decodeHlc(value);
  } catch {
    throw invalid("bad hlc");
  }
  return value;
}

/** Validates an untrusted operation and returns a copy with only known keys. */
export function parseOperation(value: unknown): Operation {
  if (!isObject(value)) throw invalid("expected an object");
  const id = nonEmptyString(value.id, "missing id");
  const hlc = encodedHlc(value.hlc);
  if (typeof value.app !== "string" || !isValidAppName(value.app)) throw invalid("bad app name");
  const app = value.app;

  switch (value.kind) {
    case "set": {
      const table = identifier(value.table, "bad table identifier");
      const row = nonEmptyString(value.row, "missing row");
      if (!isObject(value.fields)) throw invalid("bad fields");
      const entries = Object.entries(value.fields);
      if (entries.length === 0) throw invalid("empty fields");
      const fields: Record<string, SqlValue> = {};
      for (const [field, fieldValue] of entries) {
        if (!IDENTIFIER.test(field)) throw invalid("bad field identifier");
        setOwn(fields, field, sqlValue(fieldValue));
      }
      return { id, hlc, app, table, row, kind: "set", fields };
    }
    case "increment": {
      const table = identifier(value.table, "bad table identifier");
      const row = nonEmptyString(value.row, "missing row");
      const field = identifier(value.field, "bad increment field");
      if (typeof value.by !== "number" || !Number.isFinite(value.by) || value.by === 0) {
        throw invalid("bad increment by");
      }
      return { id, hlc, app, table, row, kind: "increment", field, by: value.by };
    }
    case "delete": {
      const table = identifier(value.table, "bad table identifier");
      const row = nonEmptyString(value.row, "missing row");
      return { id, hlc, app, table, row, kind: "delete" };
    }
    case "purge_app":
      return { id, hlc, app, kind: "purge_app" };
    default:
      throw invalid("unknown kind");
  }
}

/** A stored field value with the hlc and op id of the write that set it. */
export interface FieldValue {
  value: SqlValue;
  hlc: string;
  id: string;
}

/** All state for one row: fields, increments by op id and the latest delete. */
export interface RowState {
  fields: Record<string, FieldValue>;
  increments: Record<string, Record<string, { by: number; hlc: string }>>;
  deletedAt: string | null;
}

/** Merge state: applied op ids, row states and the latest purge per app. */
export interface MergeState {
  seen: Set<string>;
  rows: Map<string, RowState>;
  purgedAt: Map<string, string>;
}

/** An empty merge state. */
export function emptyState(): MergeState {
  return { seen: new Set(), rows: new Map(), purgedAt: new Map() };
}

/** The map key for one row, with separators that cannot occur in identifiers. */
export function rowKey(app: string, table: string, row: string): string {
  return `${app}\u0000${table}\u0000${row}`;
}

function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function setOwn<T>(target: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function cloneRow(row: RowState): RowState {
  const fields: Record<string, FieldValue> = {};
  for (const [field, stored] of Object.entries(row.fields)) {
    setOwn(fields, field, { value: stored.value, hlc: stored.hlc, id: stored.id });
  }
  const increments: RowState["increments"] = {};
  for (const [field, byId] of Object.entries(row.increments)) {
    const copy: Record<string, { by: number; hlc: string }> = {};
    for (const [id, entry] of Object.entries(byId)) {
      setOwn(copy, id, { by: entry.by, hlc: entry.hlc });
    }
    setOwn(increments, field, copy);
  }
  return { fields, increments, deletedAt: row.deletedAt };
}

function emptyRow(): RowState {
  return { fields: {}, increments: {}, deletedAt: null };
}

function later(current: string | null | undefined, incoming: string): string {
  return current === null || current === undefined || incoming > current ? incoming : current;
}

function latest(
  current: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  if (incoming === null || incoming === undefined) return current ?? null;
  return later(current, incoming);
}

/** Applies a batch of ops in canonical order without changing the input. */
export function applyOps(state: MergeState, ops: Operation[]): MergeState {
  const next: MergeState = {
    seen: new Set(state.seen),
    rows: new Map(),
    purgedAt: new Map(state.purgedAt),
  };
  for (const [key, row] of state.rows) next.rows.set(key, cloneRow(row));

  const ordered = [...ops].sort((a, b) =>
    a.hlc < b.hlc ? -1 : a.hlc > b.hlc ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  for (const op of ordered) {
    if (next.seen.has(op.id)) continue;
    next.seen.add(op.id);

    if (op.kind === "purge_app") {
      next.purgedAt.set(op.app, later(next.purgedAt.get(op.app), op.hlc));
      continue;
    }

    const key = rowKey(op.app, op.table, op.row);
    const row = next.rows.get(key) ?? emptyRow();

    if (op.kind === "set") {
      for (const [field, value] of Object.entries(op.fields)) {
        const stored = hasOwn(row.fields, field) ? row.fields[field] : undefined;
        if (
          !stored ||
          compareHlc(op.hlc, stored.hlc) > 0 ||
          (op.hlc === stored.hlc && op.id > stored.id)
        ) {
          setOwn(row.fields, field, { value, hlc: op.hlc, id: op.id });
        }
      }
    } else if (op.kind === "increment") {
      const existing = hasOwn(row.increments, op.field) ? row.increments[op.field] : undefined;
      const byId: Record<string, { by: number; hlc: string }> = existing ? { ...existing } : {};
      setOwn(byId, op.id, { by: op.by, hlc: op.hlc });
      setOwn(row.increments, op.field, byId);
    } else {
      row.deletedAt = later(row.deletedAt, op.hlc);
    }

    next.rows.set(key, row);
  }

  return next;
}

function after(hlc: string, cutoff: string | null): boolean {
  return cutoff === null || hlc > cutoff;
}

/** Materializes one row, or null when no field is visible after deletes and purges. */
export function materialize(
  state: MergeState,
  app: string,
  table: string,
  row: string,
): Record<string, SqlValue> | null {
  const storedRow = state.rows.get(rowKey(app, table, row));
  if (!storedRow) return null;
  const cutoff = latest(storedRow.deletedAt, state.purgedAt.get(app));
  const result: Record<string, SqlValue> = {};

  for (const [field, stored] of Object.entries(storedRow.fields)) {
    if (after(stored.hlc, cutoff)) setOwn(result, field, stored.value);
  }

  for (const [field, byId] of Object.entries(storedRow.increments)) {
    const stored = hasOwn(storedRow.fields, field) ? storedRow.fields[field] : undefined;
    const floor = stored ? latest(stored.hlc, cutoff) : cutoff;
    let sum = 0;
    let counted = false;
    for (const entry of Object.values(byId)) {
      if (after(entry.hlc, floor)) {
        sum += entry.by;
        counted = true;
      }
    }
    if (!counted) continue;
    const base = hasOwn(result, field) && typeof result[field] === "number" ? result[field] : 0;
    setOwn(result, field, base + sum);
  }

  return Object.keys(result).length > 0 ? result : null;
}

/** Materializes every visible row of one app and table, keyed by row id. */
export function materializeTable(
  state: MergeState,
  app: string,
  table: string,
): Map<string, Record<string, SqlValue>> {
  const prefix = `${app}\u0000${table}\u0000`;
  const rows = new Map<string, Record<string, SqlValue>>();
  for (const key of state.rows.keys()) {
    if (!key.startsWith(prefix)) continue;
    const row = key.slice(prefix.length);
    const values = materialize(state, app, table, row);
    if (values) rows.set(row, values);
  }
  return rows;
}
