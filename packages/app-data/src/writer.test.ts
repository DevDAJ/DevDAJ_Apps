import { DatabaseSync } from "node:sqlite";
import { describe, expect, test, vi } from "vite-plus/test";
import { applyOps, emptyState, materializeTable, type Operation } from "./changelog";
import type { SqlValue } from "./shared";
import { openWriter, type Change, type WriterDb, type WriterOptions } from "./writer";

const APP = "fitnexx";
const KEYS = { items: "id", others: "id" };

class MemoryDb implements WriterDb {
  private inTransaction = false;

  constructor(private readonly db: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(sql: string, params: SqlValue[]): Promise<{ changes: number }> {
    const result = this.db.prepare(sql).run(...params);
    return { changes: Number(result.changes) };
  }

  async getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null> {
    const row = this.db.prepare(sql).get(...params);
    return (row as unknown as T | undefined) ?? null;
  }

  async getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as unknown as T[];
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    if (this.inTransaction) throw new Error("Transaction already open");
    this.inTransaction = true;
    this.db.exec("BEGIN");
    try {
      await task();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }
}

function setup(overrides: Partial<WriterOptions> = {}) {
  const raw = new DatabaseSync(":memory:");
  raw.exec("CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', qty REAL);");
  raw.exec("CREATE TABLE others (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '');");
  const db = new MemoryDb(raw);
  let counter = 0;
  const newDeviceId = overrides.newDeviceId ?? (() => `dev_${++counter}`);
  const now = overrides.now ?? (() => 1000);
  return { raw, db, newDeviceId, now };
}

function writer(db: WriterDb, overrides: Partial<WriterOptions> = {}) {
  return openWriter(db, {
    app: APP,
    keys: KEYS,
    newDeviceId: () => "dev_a",
    now: () => 1000,
    ...overrides,
  });
}

async function rows(db: WriterDb, table: string): Promise<Record<string, SqlValue>[]> {
  return db.getAllAsync<Record<string, SqlValue>>(`SELECT * FROM "${table}" ORDER BY id`, []);
}

function sorted<T>(map: Map<string, T>): Array<[string, T]> {
  return [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function rowOf(op: Operation): string | undefined {
  return "row" in op ? op.row : undefined;
}

describe("writer writes and logs", () => {
  test("set inserts then updates, with one logged op per change and increasing HLCs", async () => {
    const { db } = setup();
    const w = await writer(db);
    await w.write("items", [{ kind: "set", row: "a", fields: { name: "first", qty: 1 } }]);
    await w.write("items", [{ kind: "set", row: "a", fields: { name: "second", qty: 2 } }]);

    expect(await rows(db, "items")).toEqual([{ id: "a", name: "second", qty: 2 }]);
    const logged = await w.opsSince(0);
    expect(logged).toHaveLength(2);
    expect(logged[0].op).toMatchObject({
      app: APP,
      table: "items",
      row: "a",
      kind: "set",
      fields: { name: "first", qty: 1 },
    });
    expect(logged[1].op).toMatchObject({ kind: "set", fields: { name: "second", qty: 2 } });
    expect(logged[1].op.hlc > logged[0].op.hlc).toBe(true);
    for (const { op } of logged) expect(op.id).toBe(op.hlc);
  });

  test("increment creates a missing row, accumulates and adds to a set value", async () => {
    const { db } = setup();
    const w = await writer(db);
    await w.write("items", [{ kind: "increment", row: "b", field: "qty", by: 2 }]);
    await w.write("items", [{ kind: "increment", row: "b", field: "qty", by: 3 }]);
    expect(await rows(db, "items")).toEqual([{ id: "b", name: "", qty: 5 }]);

    await w.write("items", [{ kind: "set", row: "c", fields: { qty: 10 } }]);
    await w.write("items", [{ kind: "increment", row: "c", field: "qty", by: -4 }]);
    expect(await rows(db, "items")).toEqual([
      { id: "b", name: "", qty: 5 },
      { id: "c", name: "", qty: 6 },
    ]);
  });

  test("delete removes the row and logs a delete op", async () => {
    const { db } = setup();
    const w = await writer(db);
    await w.write("items", [{ kind: "set", row: "a", fields: { name: "x" } }]);
    const ops = await w.write("items", [{ kind: "delete", row: "a" }]);

    expect(await rows(db, "items")).toEqual([]);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ table: "items", row: "a", kind: "delete" });
    expect((await w.opsSince(0)).map(({ op }) => op.kind)).toEqual(["set", "delete"]);
  });

  test("purge empties every keyed table and logs one purge_app op", async () => {
    const { db } = setup();
    const w = await writer(db);
    await w.write("items", [{ kind: "set", row: "a", fields: { name: "x" } }]);
    await w.write("others", [{ kind: "set", row: "b", fields: { name: "y" } }]);

    const op = await w.purge();
    expect(op).toMatchObject({ app: APP, kind: "purge_app" });
    expect(await rows(db, "items")).toEqual([]);
    expect(await rows(db, "others")).toEqual([]);
    expect((await w.opsSince(0)).map(({ op: logged }) => logged.kind)).toEqual([
      "set",
      "set",
      "purge_app",
    ]);
  });

  test("empty writes do nothing, without opening a transaction", async () => {
    const { db } = setup();
    const w = await writer(db);
    const transaction = vi.spyOn(db, "withTransactionAsync");
    expect(await w.write("items", [])).toEqual([]);
    expect(transaction).not.toHaveBeenCalled();
    expect(await w.opsSince(0)).toEqual([]);
  });

  test("serializes 20 concurrent writes without nesting transactions", async () => {
    const { db } = setup();
    const w = await writer(db);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        w.write("items", [{ kind: "set", row: `r${i}`, fields: { name: `n${i}` } }]),
      ),
    );

    const hlcs = results.map(([op]) => op.hlc);
    expect(hlcs).toHaveLength(20);
    expect(new Set(hlcs).size).toBe(20);
    for (let i = 1; i < hlcs.length; i++) expect(hlcs[i] > hlcs[i - 1]).toBe(true);
    expect((await w.opsSince(0)).map(({ op }) => op.hlc)).toEqual(hlcs);
    expect(await rows(db, "items")).toHaveLength(20);
  });

  test("a failing statement rolls back every change and log entry in the call", async () => {
    const { db } = setup();
    const w = await writer(db);
    await expect(
      w.write("items", [
        { kind: "set", row: "a", fields: { name: "kept?" } },
        { kind: "set", row: "b", fields: { missing_column: 1 } },
      ]),
    ).rejects.toThrow();

    expect(await rows(db, "items")).toEqual([]);
    expect(await w.opsSince(0)).toEqual([]);
    const meta = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM _devdaj_meta WHERE key = ?",
      ["hlc"],
    );
    expect(meta).toBeNull();
  });
});

describe("validation and device identity", () => {
  test("invalid changes throw before any transaction or write", async () => {
    const { db } = setup();
    const w = await writer(db);
    const transaction = vi.spyOn(db, "withTransactionAsync");
    const cases: Array<[string, string, Change]> = [
      ["unknown table", "missing", { kind: "set", row: "a", fields: { name: "x" } }],
      ["bad field name", "items", { kind: "set", row: "a", fields: { "bad-name": "x" } }],
      ["key column in fields", "items", { kind: "set", row: "a", fields: { id: "a" } }],
      ["NaN value", "items", { kind: "set", row: "a", fields: { qty: Number.NaN } }],
      ["bad increment field", "items", { kind: "increment", row: "a", field: "1qty", by: 1 }],
      ["zero increment", "items", { kind: "increment", row: "a", field: "qty", by: 0 }],
    ];
    for (const [, table, change] of cases) {
      await expect(w.write(table, [change])).rejects.toThrow();
    }
    expect(transaction).not.toHaveBeenCalled();
    expect(await rows(db, "items")).toEqual([]);
    expect(await w.opsSince(0)).toEqual([]);
  });

  test("invalid app names, key definitions and internal table names are rejected", async () => {
    const { db } = setup();
    await expect(
      openWriter(db, { app: "Fitnexx", keys: KEYS, newDeviceId: () => "dev_a" }),
    ).rejects.toThrow("Invalid app name");
    const badKeys: Record<string, string>[] = [
      { Bad: "id" },
      { items: "1id" },
      { _devdaj_log: "id" },
    ];
    for (const keys of badKeys) {
      await expect(
        openWriter(db, { app: APP, keys, newDeviceId: () => "dev_a" }),
      ).rejects.toThrow();
    }
  });

  test("an invalid generated device id is rejected and not persisted", async () => {
    const { db } = setup();
    await expect(writer(db, { newDeviceId: () => "bad-device" })).rejects.toThrow(
      "Invalid device id",
    );
    const stored = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM _devdaj_meta WHERE key = ?",
      ["device"],
    );
    expect(stored).toBeNull();
  });

  test("device id is created once and reused, with HLCs rising even when now goes backwards", async () => {
    const { db, newDeviceId } = setup();
    const generate = vi.fn(newDeviceId);
    const first = await writer(db, { newDeviceId: generate, now: () => 1000 });
    await first.write("items", [{ kind: "set", row: "a", fields: { name: "x" } }]);

    const second = await writer(db, { newDeviceId: generate, now: () => 500 });
    await second.write("items", [{ kind: "set", row: "b", fields: { name: "y" } }]);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(first.device).toBe(second.device);
    const ops = await second.opsSince(0);
    expect(ops).toHaveLength(2);
    expect(ops[0].op.hlc).toContain("-0000-dev_1");
    expect(ops[1].op.hlc).toContain("-0001-dev_1");
    expect(ops[1].op.hlc > ops[0].op.hlc).toBe(true);
  });
});

describe("opsSince", () => {
  test("pages by seq, oldest first, with a limit", async () => {
    const { db } = setup();
    const w = await writer(db);
    for (let i = 0; i < 5; i++) {
      await w.write("items", [{ kind: "set", row: `r${i}`, fields: { name: `n${i}` } }]);
    }

    expect((await w.opsSince(0, 2)).map(({ seq, op }) => [seq, rowOf(op)])).toEqual([
      [1, "r0"],
      [2, "r1"],
    ]);
    expect((await w.opsSince(2, 2)).map(({ op }) => rowOf(op))).toEqual(["r2", "r3"]);
    expect((await w.opsSince(4)).map(({ op }) => rowOf(op))).toEqual(["r4"]);
    expect(await w.opsSince(5)).toEqual([]);
  });

  test("rejects tampered log rows instead of trusting them", async () => {
    const { raw, db } = setup();
    const w = await writer(db);
    await w.write("items", [{ kind: "set", row: "a", fields: { name: "x" } }]);
    raw.prepare("UPDATE _devdaj_log SET op = ? WHERE seq = ?").run("{", 1);
    await expect(w.opsSince(0)).rejects.toThrow();

    raw
      .prepare("UPDATE _devdaj_log SET op = ? WHERE seq = ?")
      .run(JSON.stringify({ kind: "delete" }), 1);
    await expect(w.opsSince(0)).rejects.toThrow("Invalid operation");
  });
});

describe("round trip", () => {
  test("replaying logged ops rebuilds the same rows as the tables", async () => {
    const { db } = setup();
    const w = await writer(db);
    await w.write("items", [
      { kind: "set", row: "a", fields: { name: "A", qty: 1 } },
      { kind: "set", row: "b", fields: { name: "B", qty: 2 } },
    ]);
    await w.write("items", [{ kind: "increment", row: "a", field: "qty", by: 3 }]);
    await w.write("others", [{ kind: "set", row: "o", fields: { name: "O" } }]);
    await w.purge();
    await w.write("items", [{ kind: "set", row: "c", fields: { name: "C", qty: 4 } }]);

    const ops = (await w.opsSince(0)).map(({ op }) => op);
    const state = applyOps(emptyState(), ops);
    for (const table of Object.keys(KEYS)) {
      const actual = new Map<string, Record<string, SqlValue>>();
      for (const row of await rows(db, table)) {
        const { id, ...fields } = row;
        actual.set(String(id), fields);
      }
      expect(sorted(actual)).toEqual(sorted(materializeTable(state, APP, table)));
    }
  });
});
