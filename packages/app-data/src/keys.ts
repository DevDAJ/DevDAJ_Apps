import type { SqlValue } from "./shared";
import type { WriterDb } from "./writer";

/** Where this app keeps the raw key (expo-secure-store with keychainAccessGroup on iOS). */
export interface SecretStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}

/** A JSON-safe wrapped data key, structurally identical to the one from @devdaj/crypto. */
export interface WrappedKey {
  v: 1;
  kind: "passphrase" | "recovery";
  salt?: string;
  opsLimit?: number;
  memLimit?: number;
  nonce: string;
  ct: string;
}

/** The parts of @devdaj/crypto's createCrypto() used here. */
export interface KeyCrypto {
  generateDataKey(): Uint8Array;
  wrapWithPassphrase(key: Uint8Array, passphrase: string): WrappedKey;
  unwrapWithPassphrase(w: WrappedKey, passphrase: string): Uint8Array;
  generateRecoveryKey(): string;
  wrapWithRecoveryKey(key: Uint8Array, recoveryKey: string): WrappedKey;
  unwrapWithRecoveryKey(w: WrappedKey, recoveryKey: string): Uint8Array;
}

/** Whether the raw key is available, a wrapped key can be found, or neither. */
export type KeyStatus = "none" | "locked" | "unlocked";

/** Everything the key manager needs; the app injects crypto, storage and sibling reads. */
export interface KeyManagerOptions {
  crypto: KeyCrypto;
  secrets: SecretStore;
  /** This app's shared data.db, where the wrapped key blobs live. */
  ownDb: WriterDb;
  /** Other app names to look in, in order. */
  siblings: string[];
  /** Reads a sibling's shared data.db, normally `appData.query`. */
  readSibling(app: string, sql: string): Promise<Record<string, SqlValue>[]>;
}

/** Creates and shares the one data key used by all of a user's DevDAJ apps. */
export interface KeyManager {
  status(): Promise<KeyStatus>;
  getDataKey(): Promise<Uint8Array | null>;
  setup(passphrase: string): Promise<{ recoveryKey: string }>;
  unlockWithPassphrase(passphrase: string): Promise<void>;
  unlockWithRecoveryKey(recoveryKey: string): Promise<void>;
  changePassphrase(currentPassphrase: string, newPassphrase: string): Promise<void>;
}

const SECRET_NAME = "devdaj_data_key_v1";
const KEY_BYTES = 32;
const TABLE = "_devdaj_keys";
const SELECT_BLOBS = `SELECT kind, blob, updated_at FROM ${TABLE}`;
const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BASE64URL_TEXT = /^[A-Za-z0-9_-]*$/;

type BlobKind = WrappedKey["kind"];

interface Candidate {
  kind: BlobKind;
  blob: WrappedKey;
  updatedAt: string;
  raw: string;
}

function isBase64Url(value: unknown): value is string {
  return typeof value === "string" && value.length % 4 !== 1 && BASE64URL_TEXT.test(value);
}

/** Encodes bytes as unpadded base64url, without platform-specific APIs. */
function encodeBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += BASE64URL[b0 >> 2];
    out += BASE64URL[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += BASE64URL[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += BASE64URL[b2 & 0x3f];
  }
  return out;
}

/** Decodes unpadded base64url, or returns null when the value is not base64url. */
function decodeBase64Url(value: string): Uint8Array | null {
  if (value.length % 4 === 1) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < value.length; i++) {
    const digit = BASE64URL.indexOf(value[i]);
    if (digit < 0) return null;
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/** Validates an untrusted wrapped-key blob read from this or another app's database. */
export function parseWrappedKey(value: unknown): WrappedKey {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Invalid wrapped key");
  }
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;
  if (raw.v !== 1 || (kind !== "passphrase" && kind !== "recovery")) {
    throw new TypeError("Invalid wrapped key");
  }
  if (
    !isBase64Url(raw.nonce) ||
    !isBase64Url(raw.ct) ||
    raw.nonce.length === 0 ||
    raw.ct.length === 0
  ) {
    throw new TypeError("Invalid wrapped key");
  }
  const blob: WrappedKey = { v: 1, kind, nonce: raw.nonce, ct: raw.ct };
  if (raw.salt !== undefined) {
    if (!isBase64Url(raw.salt) || raw.salt.length === 0) throw new TypeError("Invalid wrapped key");
    blob.salt = raw.salt;
  }
  for (const field of ["opsLimit", "memLimit"] as const) {
    const number = raw[field];
    if (number === undefined) continue;
    if (typeof number !== "number" || !Number.isFinite(number)) {
      throw new TypeError("Invalid wrapped key");
    }
    blob[field] = number;
  }
  return blob;
}

function parseCandidates(rows: Record<string, SqlValue>[]): Candidate[] {
  const candidates: Candidate[] = [];
  for (const row of rows) {
    const kind = row.kind;
    if (
      (kind !== "passphrase" && kind !== "recovery") ||
      typeof row.blob !== "string" ||
      typeof row.updated_at !== "string"
    ) {
      continue;
    }
    try {
      const blob = parseWrappedKey(JSON.parse(row.blob));
      if (blob.kind === kind) {
        candidates.push({ kind, blob, updatedAt: row.updated_at, raw: row.blob });
      }
    } catch {
      // A sibling's row is untrusted input: ignore malformed blobs.
    }
  }
  return candidates;
}

function newest(candidates: Candidate[]): Candidate | undefined {
  let best: Candidate | undefined;
  for (const candidate of candidates) {
    if (!best || candidate.updatedAt > best.updatedAt) best = candidate;
  }
  return best;
}

/** Creates a key manager from injected dependencies. */
export function createKeyManager(options: KeyManagerOptions): KeyManager {
  const { crypto, secrets, ownDb, siblings } = options;
  let tableReady: Promise<void> | null = null;

  async function ensureTable(): Promise<void> {
    if (!tableReady) {
      tableReady = ownDb
        .execAsync(
          `CREATE TABLE IF NOT EXISTS ${TABLE} (kind TEXT PRIMARY KEY, blob TEXT NOT NULL, updated_at TEXT NOT NULL)`,
        )
        .catch((error: unknown) => {
          tableReady = null;
          throw error;
        });
    }
    await tableReady;
  }

  async function ownCandidates(): Promise<Candidate[]> {
    await ensureTable();
    return parseCandidates(await ownDb.getAllAsync<Record<string, SqlValue>>(SELECT_BLOBS, []));
  }

  async function siblingCandidates(): Promise<Candidate[]> {
    const candidates: Candidate[] = [];
    for (const app of siblings) {
      try {
        candidates.push(...parseCandidates(await options.readSibling(app, SELECT_BLOBS)));
      } catch {
        // A sibling that is not installed or cannot be read is skipped.
      }
    }
    return candidates;
  }

  async function findBlob(kind: BlobKind): Promise<Candidate | undefined> {
    const own = newest((await ownCandidates()).filter((candidate) => candidate.kind === kind));
    const other = newest(
      (await siblingCandidates()).filter((candidate) => candidate.kind === kind),
    );
    if (!own) return other;
    if (!other) return own;
    return other.updatedAt > own.updatedAt ? other : own;
  }

  async function put(kind: BlobKind, blob: WrappedKey, updatedAt: string): Promise<void> {
    await ownDb.runAsync(
      `INSERT INTO ${TABLE} (kind, blob, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(kind) DO UPDATE SET blob = excluded.blob, updated_at = excluded.updated_at`,
      [kind, JSON.stringify(blob), updatedAt],
    );
  }

  async function copyBlobs(): Promise<void> {
    await ensureTable();
    const own = await ownCandidates();
    const others = await siblingCandidates();
    const missing: Candidate[] = [];
    for (const kind of ["passphrase", "recovery"] as const) {
      const best = newest([
        ...own.filter((candidate) => candidate.kind === kind),
        ...others.filter((candidate) => candidate.kind === kind),
      ]);
      if (!best) continue;
      const current = own.find((candidate) => candidate.kind === kind);
      if (current?.raw === best.raw && current.updatedAt === best.updatedAt) continue;
      missing.push(best);
    }
    if (missing.length === 0) return;
    await ownDb.withTransactionAsync(async () => {
      for (const candidate of missing) {
        await put(candidate.kind, candidate.blob, candidate.updatedAt);
      }
    });
  }

  async function readSecret(): Promise<Uint8Array | null> {
    const value = await secrets.get(SECRET_NAME);
    if (typeof value !== "string") return null;
    const key = decodeBase64Url(value);
    return key && key.length === KEY_BYTES ? key : null;
  }

  async function getStatus(): Promise<KeyStatus> {
    if (await readSecret()) return "unlocked";
    if ((await ownCandidates()).length > 0) return "locked";
    return (await siblingCandidates()).length > 0 ? "locked" : "none";
  }

  return {
    status: getStatus,

    async getDataKey() {
      const key = await readSecret();
      if (!key) return null;
      await copyBlobs();
      return key;
    },

    async setup(passphrase) {
      if ((await getStatus()) !== "none") throw new Error("Encryption is already set up");
      const key = crypto.generateDataKey();
      const recoveryKey = crypto.generateRecoveryKey();
      const passphraseBlob = crypto.wrapWithPassphrase(key, passphrase);
      const recoveryBlob = crypto.wrapWithRecoveryKey(key, recoveryKey);
      const updatedAt = new Date().toISOString();
      await ensureTable();
      await ownDb.withTransactionAsync(async () => {
        await put("passphrase", passphraseBlob, updatedAt);
        await put("recovery", recoveryBlob, updatedAt);
      });
      await secrets.set(SECRET_NAME, encodeBase64Url(key));
      return { recoveryKey };
    },

    async unlockWithPassphrase(passphrase) {
      const found = await findBlob("passphrase");
      if (!found) throw new Error("No encrypted key found");
      const key = crypto.unwrapWithPassphrase(found.blob, passphrase);
      await secrets.set(SECRET_NAME, encodeBase64Url(key));
      await copyBlobs();
    },

    async unlockWithRecoveryKey(recoveryKey) {
      const found = await findBlob("recovery");
      if (!found) throw new Error("No encrypted key found");
      const key = crypto.unwrapWithRecoveryKey(found.blob, recoveryKey);
      await secrets.set(SECRET_NAME, encodeBase64Url(key));
      await copyBlobs();
    },

    async changePassphrase(currentPassphrase, newPassphrase) {
      // shortcut: siblings keep the old passphrase blob until they next copy; the newest updated_at wins when copying.
      const found = await findBlob("passphrase");
      if (!found) throw new Error("No encrypted key found");
      const key = crypto.unwrapWithPassphrase(found.blob, currentPassphrase);
      const blob = crypto.wrapWithPassphrase(key, newPassphrase);
      await ensureTable();
      await put("passphrase", blob, new Date().toISOString());
    },
  };
}
