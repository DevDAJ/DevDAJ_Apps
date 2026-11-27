import {
  decodeHlc,
  encodeHlc,
  hlcTick,
  parseOperation,
  type Hlc,
  type Operation,
} from "./changelog";
import { isValidAppName, type SqlValue } from "./shared";

// Remote operations are not applied here yet; sync step 6 rebuilds tables from the log with applyOps.

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,63}$/;
const DEVICE = /^[A-Za-z0-9_]{1,64}$/;
const META_TABLE = "_devdaj_meta";
const LOG_TABLE = "_devdaj_log";

/** The small slice of expo-sqlite that the writer needs. */
export interface WriterDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlValue[]): Promise<{ changes: number }>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/** How to identify this device, the writable tables and their clocks. */
export interface WriterOptions {
  app: string;
  // shortcut: one TEXT/INTEGER primary-key column per table; composite keys need an id column first.
  keys: Record<string, string>;
  newDeviceId: () => string;
  now?: () => number;
}

/** One local change to a row, or a deletion. */
export type Change =
  | { kind: "set"; row: string; fields: Record<string, SqlValue> }
  | { kind: "increment"; row: string; field: string; by: number }
  | { kind: "delete"; row: string };

/** Writes and reads inside one open writer transaction. */
export interface WriterTransaction {
  /** Applies and logs changes to one table inside the open transaction. */
  write(table: string, changes: Change[]): Promise<Operation[]>;
  /** Deletes every row of every keyed table and logs one purge_app, inside the open transaction. */
  purge(): Promise<Operation>;
  /** Read helpers on the same connection, inside the transaction. */
  getFirst<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  getAll<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
}

/** Applies local changes and records the matching operations in one transaction. */
export interface Writer {
  readonly device: string;
  /** Applies the changes to `table` and logs one operation per change, all in one transaction. Returns the logged operations. */
  write(table: string, changes: Change[]): Promise<Operation[]>;
  /** Deletes every row of every table in `keys` and logs one purge_app operation. */
  purge(): Promise<Operation>;
  /** Runs `task` in one serialized transaction; every write inside it commits or rolls back together. */
  transaction<T>(task: (tx: WriterTransaction) => Promise<T>): Promise<T>;
  /** Logged operations with seq > afterSeq, oldest first, at most `limit` (default 500). */
  opsSince(afterSeq: number, limit?: number): Promise<{ seq: number; op: Operation }[]>;
}

function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function keyColumnOf(keys: Record<string, string>, table: string): string | undefined {
  return hasOwn(keys, table) ? keys[table] : undefined;
}

/** Opens a writer, creating the internal tables and loading or creating the device id. */
export async function openWriter(db: WriterDb, options: WriterOptions): Promise<Writer> {
  const { app, keys, newDeviceId } = options;
  const now = options.now ?? (() => Date.now());

  if (!isValidAppName(app)) throw new Error(`Invalid app name: ${app}`);
  for (const [table, keyColumn] of Object.entries(keys)) {
    if (!IDENTIFIER.test(table) || table.startsWith("_devdaj_")) {
      throw new Error(`Invalid writable table: ${table}`);
    }
    if (!IDENTIFIER.test(keyColumn)) throw new Error(`Invalid key column: ${keyColumn}`);
  }

  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS ${META_TABLE} (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  );
  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      hlc TEXT NOT NULL,
      op TEXT NOT NULL
    );`,
  );

  const stored = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM ${META_TABLE} WHERE key = ?`,
    ["device"],
  );
  let device: string;
  if (stored) {
    device = stored.value;
  } else {
    device = newDeviceId();
    if (typeof device !== "string" || !DEVICE.test(device)) {
      throw new Error("Invalid device id: expected 1 to 64 characters of [A-Za-z0-9_]");
    }
    await db.runAsync(`INSERT INTO ${META_TABLE} (key, value) VALUES (?, ?)`, ["device", device]);
  }

  async function previousHlc(): Promise<Hlc | null> {
    const meta = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM ${META_TABLE} WHERE key = ?`,
      ["hlc"],
    );
    return meta ? decodeHlc(meta.value) : null;
  }

  async function setMeta(key: string, value: string): Promise<void> {
    await db.runAsync(
      `INSERT INTO ${META_TABLE} (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  async function logOp(op: Operation): Promise<void> {
    await db.runAsync(`INSERT INTO ${LOG_TABLE} (id, hlc, op) VALUES (?, ?, ?)`, [
      op.id,
      op.hlc,
      JSON.stringify(op),
    ]);
  }

  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  function checkWrite(table: string, changes: Change[]): string {
    const keyColumn = keyColumnOf(keys, table);
    if (keyColumn === undefined) throw new Error(`Unknown table: ${table}`);
    validateChanges(table, keyColumn, changes, device);
    return keyColumn;
  }

  function buildOp(table: string, change: Change, hlc: string): Operation {
    const base = { id: hlc, hlc, app, table, row: change.row };
    switch (change.kind) {
      case "set":
        return parseOperation({ ...base, kind: "set", fields: change.fields });
      case "increment":
        return parseOperation({ ...base, kind: "increment", field: change.field, by: change.by });
      case "delete":
        return parseOperation({ ...base, kind: "delete" });
    }
  }

  function validateChanges(
    table: string,
    keyColumn: string,
    changes: Change[],
    deviceId: string,
  ): void {
    const placeholder = encodeHlc({ wall: 0, counter: 0, device: deviceId });
    for (const change of changes) {
      if (change.kind === "set" && hasOwn(change.fields, keyColumn)) {
        throw new Error(`Cannot set primary-key column "${keyColumn}"`);
      }
      buildOp(table, change, placeholder);
    }
  }

  async function applyOp(table: string, keyColumn: string, op: Operation): Promise<void> {
    switch (op.kind) {
      case "set": {
        const entries = Object.entries(op.fields);
        const columns = entries.map(([field]) => `"${field}"`).join(", ");
        const placeholders = entries.map(() => "?").join(", ");
        const updates = entries.map(([field]) => `"${field}" = excluded."${field}"`).join(", ");
        await db.runAsync(
          `INSERT INTO "${table}" ("${keyColumn}", ${columns}) VALUES (?, ${placeholders}) ON CONFLICT("${keyColumn}") DO UPDATE SET ${updates}`,
          [op.row, ...entries.map(([, value]) => value)],
        );
        break;
      }
      case "increment": {
        await db.runAsync(
          `INSERT INTO "${table}" ("${keyColumn}", "${op.field}") VALUES (?, ?) ON CONFLICT("${keyColumn}") DO UPDATE SET "${op.field}" = COALESCE("${op.field}", 0) + excluded."${op.field}"`,
          [op.row, op.by],
        );
        break;
      }
      case "delete":
        await db.runAsync(`DELETE FROM "${table}" WHERE "${keyColumn}" = ?`, [op.row]);
        break;
      case "purge_app":
        break;
    }
  }

  function transaction<T>(task: (tx: WriterTransaction) => Promise<T>): Promise<T> {
    return serial(async () => {
      let open = false;
      let prev: Hlc | null = null;
      const ensureOpen = (): void => {
        if (!open) throw new Error("Writer transaction is closed");
      };
      const nextHlc = (): string => {
        const ticked = hlcTick(prev, now(), device);
        prev = ticked;
        return encodeHlc(ticked);
      };
      const tx: WriterTransaction = {
        async write(table: string, changes: Change[]): Promise<Operation[]> {
          ensureOpen();
          if (changes.length === 0) return [];
          const keyColumn = checkWrite(table, changes);
          const ops: Operation[] = [];
          for (const change of changes) {
            ops.push(buildOp(table, change, nextHlc()));
          }
          await setMeta("hlc", ops[ops.length - 1].hlc);
          for (const op of ops) {
            await applyOp(table, keyColumn, op);
            await logOp(op);
          }
          return ops;
        },
        async purge(): Promise<Operation> {
          ensureOpen();
          const encoded = nextHlc();
          const op = parseOperation({ id: encoded, hlc: encoded, app, kind: "purge_app" });
          await setMeta("hlc", encoded);
          for (const table of Object.keys(keys)) {
            await db.runAsync(`DELETE FROM "${table}"`, []);
          }
          await logOp(op);
          return op;
        },
        async getFirst<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
          ensureOpen();
          return db.getFirstAsync<T>(sql, params);
        },
        async getAll<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
          ensureOpen();
          return db.getAllAsync<T>(sql, params);
        },
      };
      let result!: T;
      try {
        await db.withTransactionAsync(async () => {
          open = true;
          prev = await previousHlc();
          result = await task(tx);
        });
      } finally {
        open = false;
      }
      return result;
    });
  }

  return {
    device,

    async write(table: string, changes: Change[]): Promise<Operation[]> {
      if (changes.length === 0) return [];
      checkWrite(table, changes);
      return transaction((tx) => tx.write(table, changes));
    },

    async purge(): Promise<Operation> {
      return transaction((tx) => tx.purge());
    },

    transaction,

    async opsSince(afterSeq: number, limit = 500): Promise<{ seq: number; op: Operation }[]> {
      const rows = await db.getAllAsync<{ seq: number; op: string }>(
        `SELECT seq, op FROM ${LOG_TABLE} WHERE seq > ? ORDER BY seq ASC LIMIT ?`,
        [afterSeq, limit],
      );
      return rows.map((row) => ({ seq: row.seq, op: parseOperation(JSON.parse(row.op)) }));
    },
  };
}
