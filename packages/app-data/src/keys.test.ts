import { DatabaseSync } from "node:sqlite";
import sodium from "libsodium-wrappers-sumo";
import { createCrypto } from "@devdaj/crypto";
import { describe, expect, test } from "vite-plus/test";
import {
  createKeyManager,
  parseWrappedKey,
  type KeyCrypto,
  type KeyManager,
  type SecretStore,
} from "./keys";
import type { SqlValue } from "./shared";
import type { WriterDb } from "./writer";

await sodium.ready;

const cryptoLib = createCrypto(sodium);
const LOW_KDF = { opsLimit: 1, memLimit: 8 * 1024 * 1024 } as const;
const crypto: KeyCrypto = {
  generateDataKey: () => cryptoLib.generateDataKey(),
  wrapWithPassphrase: (key, passphrase) => cryptoLib.wrapWithPassphrase(key, passphrase, LOW_KDF),
  unwrapWithPassphrase: (wrapped, passphrase) =>
    cryptoLib.unwrapWithPassphrase(wrapped, passphrase),
  generateRecoveryKey: () => cryptoLib.generateRecoveryKey(),
  wrapWithRecoveryKey: (key, recoveryKey) => cryptoLib.wrapWithRecoveryKey(key, recoveryKey),
  unwrapWithRecoveryKey: (wrapped, recoveryKey) =>
    cryptoLib.unwrapWithRecoveryKey(wrapped, recoveryKey),
};
const PASSPHRASE = "correct horse battery";
const NEXT_PASSPHRASE = "another good phrase";
const SECRET_NAME = "devdaj_data_key_v1";

class MemoryDb implements WriterDb {
  private inTransaction = false;

  constructor(readonly raw: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.raw.exec(sql);
  }

  async runAsync(sql: string, params: SqlValue[]): Promise<{ changes: number }> {
    const result = this.raw.prepare(sql).run(...params);
    return { changes: Number(result.changes) };
  }

  async getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null> {
    return (this.raw.prepare(sql).get(...params) as T | undefined) ?? null;
  }

  async getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]> {
    return this.raw.prepare(sql).all(...params) as T[];
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    if (this.inTransaction) throw new Error("Transaction already open");
    this.inTransaction = true;
    this.raw.exec("BEGIN");
    try {
      await task();
      this.raw.exec("COMMIT");
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }
}

interface TestApp {
  db: MemoryDb;
  secrets: SecretStore;
  manager: KeyManager;
}

function fixture() {
  const dbs = new Map<string, MemoryDb>();
  const readSibling = async (app: string, sql: string): Promise<Record<string, SqlValue>[]> => {
    const db = dbs.get(app);
    if (!db) throw new Error(`${app} isn't installed`);
    return db.getAllAsync<Record<string, SqlValue>>(sql, []);
  };
  function add(app: string, siblings: string[] = []): TestApp {
    const db = new MemoryDb(new DatabaseSync(":memory:"));
    dbs.set(app, db);
    const values = new Map<string, string>();
    const secrets: SecretStore = {
      async get(name) {
        return values.get(name) ?? null;
      },
      async set(name, value) {
        values.set(name, value);
      },
      async delete(name) {
        values.delete(name);
      },
    };
    const manager = createKeyManager({ crypto, secrets, ownDb: db, siblings, readSibling });
    return { db, secrets, manager };
  }
  return { add };
}

async function blobRows(db: WriterDb): Promise<Record<string, SqlValue>[]> {
  return db.getAllAsync<Record<string, SqlValue>>(
    "SELECT kind, blob, updated_at FROM _devdaj_keys ORDER BY kind",
    [],
  );
}

function blobOf(rows: Record<string, SqlValue>[], kind: string): string {
  const blob = rows.find((row) => row.kind === kind)?.blob;
  if (typeof blob !== "string") throw new Error(`Missing ${kind} blob`);
  return blob;
}

describe("parseWrappedKey", () => {
  test("accepts a real blob and rejects malformed ones", () => {
    const wrapped = cryptoLib.wrapWithPassphrase(cryptoLib.generateDataKey(), PASSPHRASE, LOW_KDF);
    expect(parseWrappedKey(JSON.parse(JSON.stringify(wrapped)))).toEqual(wrapped);

    const bad: unknown[] = [
      null,
      [],
      {},
      { ...wrapped, v: 2 },
      { ...wrapped, kind: "other" },
      { ...wrapped, nonce: 42 },
      { ...wrapped, ct: "not base64!" },
      { ...wrapped, salt: "not base64!" },
      { ...wrapped, opsLimit: Number.NaN },
      { ...wrapped, memLimit: "8" },
    ];
    for (const value of bad) expect(() => parseWrappedKey(value)).toThrow();
  });
});

describe("key setup", () => {
  test("starts at none, then setup creates and stores the key", async () => {
    const { add } = fixture();
    const app = add("a");
    expect(await app.manager.status()).toBe("none");
    expect(await app.manager.getDataKey()).toBeNull();

    const { recoveryKey } = await app.manager.setup(PASSPHRASE);
    expect(typeof recoveryKey).toBe("string");
    expect(await app.manager.status()).toBe("unlocked");
    expect(await app.manager.getDataKey()).toHaveLength(32);
    expect((await blobRows(app.db)).map((row) => row.kind)).toEqual(["passphrase", "recovery"]);
  });

  test("setup twice is refused", async () => {
    const app = fixture().add("a");
    await app.manager.setup(PASSPHRASE);
    await expect(app.manager.setup(NEXT_PASSPHRASE)).rejects.toThrow(
      "Encryption is already set up",
    );
  });

  test("setup is refused when a sibling already has blobs", async () => {
    const { add } = fixture();
    const first = add("a");
    await first.manager.setup(PASSPHRASE);
    const second = add("b", ["a"]);
    expect(await second.manager.status()).toBe("locked");
    await expect(second.manager.setup(PASSPHRASE)).rejects.toThrow("Encryption is already set up");
  });

  test("a throwing sibling is skipped", async () => {
    const app = fixture().add("b", ["missing", "not-installed"]);
    expect(await app.manager.status()).toBe("none");
    const { recoveryKey } = await app.manager.setup(PASSPHRASE);
    expect(await app.manager.status()).toBe("unlocked");
    expect(recoveryKey.length).toBeGreaterThan(0);
  });
});

describe("sharing between apps", () => {
  test("a second app unlocks with the passphrase and gets the identical key", async () => {
    const { add } = fixture();
    const first = add("a");
    await first.manager.setup(PASSPHRASE);
    const key = await first.manager.getDataKey();

    const second = add("b", ["a"]);
    expect(await second.manager.status()).toBe("locked");
    expect(await second.manager.getDataKey()).toBeNull();
    await second.manager.unlockWithPassphrase(PASSPHRASE);
    expect(await second.manager.status()).toBe("unlocked");
    expect(await second.manager.getDataKey()).toEqual(key);
    expect((await blobRows(second.db)).map((row) => row.kind)).toEqual(["passphrase", "recovery"]);
  });

  test("a second app unlocks with the recovery key", async () => {
    const { add } = fixture();
    const first = add("a");
    const { recoveryKey } = await first.manager.setup(PASSPHRASE);
    const key = await first.manager.getDataKey();

    const second = add("b", ["a"]);
    expect(await second.manager.status()).toBe("locked");
    await second.manager.unlockWithRecoveryKey(recoveryKey);
    expect(await second.manager.getDataKey()).toEqual(key);
  });

  test("a wrong passphrase propagates the crypto error and leaves the app locked", async () => {
    const { add } = fixture();
    const first = add("a");
    await first.manager.setup(PASSPHRASE);
    const second = add("b", ["a"]);

    await expect(second.manager.unlockWithPassphrase("wrong passphrase")).rejects.toMatchObject({
      code: "wrong_secret",
    });
    expect(await second.manager.status()).toBe("locked");
    expect(await second.manager.getDataKey()).toBeNull();
  });

  test("malformed sibling blobs are ignored", async () => {
    const { add } = fixture();
    const first = add("a");
    const { recoveryKey } = await first.manager.setup(PASSPHRASE);
    const second = add("b", ["a"]);

    first.db.raw.prepare("UPDATE _devdaj_keys SET blob = ?").run("{");
    expect(await second.manager.status()).toBe("none");
    await expect(second.manager.unlockWithPassphrase(PASSPHRASE)).rejects.toThrow(
      "No encrypted key found",
    );
    await expect(second.manager.unlockWithRecoveryKey(recoveryKey)).rejects.toThrow(
      "No encrypted key found",
    );

    first.db.raw
      .prepare("UPDATE _devdaj_keys SET blob = ? WHERE kind = ?")
      .run(JSON.stringify({ v: 2, kind: "passphrase", nonce: "AAA", ct: "AAA" }), "passphrase");
    first.db.raw
      .prepare("UPDATE _devdaj_keys SET blob = ? WHERE kind = ?")
      .run(JSON.stringify({ v: 1, kind: "passphrase", nonce: 4, ct: "AAA" }), "recovery");
    expect(await second.manager.status()).toBe("none");
  });

  test("a corrupt secret is treated as absent", async () => {
    const app = fixture().add("a");
    await app.manager.setup(PASSPHRASE);
    const key = await app.manager.getDataKey();

    await app.secrets.set(SECRET_NAME, "!!!not base64!!!");
    expect(await app.manager.status()).toBe("locked");
    expect(await app.manager.getDataKey()).toBeNull();
    await app.secrets.set(SECRET_NAME, "AAAA");
    expect(await app.manager.getDataKey()).toBeNull();

    await app.manager.unlockWithPassphrase(PASSPHRASE);
    expect(await app.manager.status()).toBe("unlocked");
    expect(await app.manager.getDataKey()).toEqual(key);
  });

  test("getDataKey copies sibling blobs when the own table is empty", async () => {
    const { add } = fixture();
    const first = add("a");
    await first.manager.setup(PASSPHRASE);
    const key = await first.manager.getDataKey();
    const second = add("b", ["a"]);
    await second.manager.unlockWithPassphrase(PASSPHRASE);
    second.db.raw.prepare("DELETE FROM _devdaj_keys").run();

    expect(await second.manager.getDataKey()).toEqual(key);
    expect((await blobRows(second.db)).map((row) => row.kind)).toEqual(["passphrase", "recovery"]);
  });
});

describe("changePassphrase", () => {
  test("rewraps the same key and leaves the recovery blob intact", async () => {
    const { add } = fixture();
    const first = add("a");
    const { recoveryKey } = await first.manager.setup(PASSPHRASE);
    const key = await first.manager.getDataKey();
    const before = await blobRows(first.db);

    await first.manager.changePassphrase(PASSPHRASE, NEXT_PASSPHRASE);

    const after = await blobRows(first.db);
    expect(blobOf(after, "recovery")).toBe(blobOf(before, "recovery"));
    expect(blobOf(after, "passphrase")).not.toBe(blobOf(before, "passphrase"));
    const recovery = parseWrappedKey(JSON.parse(blobOf(after, "recovery")));
    expect(cryptoLib.unwrapWithRecoveryKey(recovery, recoveryKey)).toEqual(key);

    const second = add("b", ["a"]);
    await expect(second.manager.unlockWithPassphrase(PASSPHRASE)).rejects.toMatchObject({
      code: "wrong_secret",
    });
    await second.manager.unlockWithPassphrase(NEXT_PASSPHRASE);
    expect(await second.manager.getDataKey()).toEqual(key);
  });

  test("the newest updated_at wins across apps", async () => {
    const { add } = fixture();
    const first = add("a");
    await first.manager.setup(PASSPHRASE);
    const key = await first.manager.getDataKey();
    const old = "2000-01-01T00:00:00.000Z";
    first.db.raw.prepare("UPDATE _devdaj_keys SET updated_at = ?").run(old);

    const second = add("b", ["a"]);
    await second.manager.unlockWithPassphrase(PASSPHRASE);
    expect(await second.manager.getDataKey()).toEqual(key);
    expect((await blobRows(second.db)).every((row) => row.updated_at === old)).toBe(true);

    await first.manager.changePassphrase(PASSPHRASE, NEXT_PASSPHRASE);
    expect(await second.manager.getDataKey()).toEqual(key);
    await expect(second.manager.unlockWithPassphrase(PASSPHRASE)).rejects.toMatchObject({
      code: "wrong_secret",
    });
    await expect(second.manager.unlockWithPassphrase(NEXT_PASSPHRASE)).resolves.toBeUndefined();

    const third = add("c", ["b", "a"]);
    await third.manager.unlockWithPassphrase(NEXT_PASSPHRASE);
    expect(await third.manager.getDataKey()).toEqual(key);
  });
});
