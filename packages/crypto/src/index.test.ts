import sodium from "libsodium-wrappers-sumo";
import { describe, expect, test } from "vite-plus/test";
import { createCrypto, CryptoError, DEFAULT_KDF, KEY_BYTES, type WrappedKey } from "./index";

await sodium.ready;

const crypto = createCrypto(sodium);
const LOW_KDF = { opsLimit: 1, memLimit: 8 * 1024 * 1024 };
const CONTEXT = "fitnexx:sync:v1";
const base64Variant = sodium.base64_variants.URLSAFE_NO_PADDING;

function expectCryptoError(run: () => unknown, code: CryptoError["code"]): void {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(CryptoError);
  expect((thrown as CryptoError).code).toBe(code);
}

function flipFirstChar(value: string): string {
  return (value[0] === "A" ? "B" : "A") + value.slice(1);
}

function withConfusables(recoveryKey: string): string {
  return recoveryKey
    .toLowerCase()
    .replace(/-/g, " - ")
    .replace(/0/g, "o")
    .replace(/1/g, (_, offset: number) => (offset % 2 === 0 ? "l" : "i"));
}

function recoveryKeyWithZeroAndOne(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const key = crypto.generateRecoveryKey();
    if (key.includes("0") && key.includes("1")) {
      return key;
    }
  }
  throw new Error("no recovery key with 0 and 1 generated");
}

describe("passphrase wrapping", () => {
  test("round trips with a low kdf", () => {
    const key = crypto.generateDataKey();
    expect(key).toHaveLength(KEY_BYTES);
    const wrapped = crypto.wrapWithPassphrase(key, "correct horse battery", LOW_KDF);
    expect(wrapped.v).toBe(1);
    expect(wrapped.kind).toBe("passphrase");
    expect(wrapped.opsLimit).toBe(LOW_KDF.opsLimit);
    expect(wrapped.memLimit).toBe(LOW_KDF.memLimit);
    expect(typeof wrapped.salt).toBe("string");
    expect(crypto.unwrapWithPassphrase(wrapped, "correct horse battery")).toEqual(key);
  });

  test("round trips with DEFAULT_KDF", () => {
    const key = crypto.generateDataKey();
    const wrapped = crypto.wrapWithPassphrase(key, "correct horse battery", DEFAULT_KDF);
    expect(wrapped.memLimit).toBe(64 * 1024 * 1024);
    expect(crypto.unwrapWithPassphrase(wrapped, "correct horse battery")).toEqual(key);
  });

  test("composed and decomposed accents unlock the same key", () => {
    const key = crypto.generateDataKey();
    const wrapped = crypto.wrapWithPassphrase(key, "café passphrase", LOW_KDF);
    expect(crypto.unwrapWithPassphrase(wrapped, "café passphrase")).toEqual(key);
  });

  test("wrong passphrase raises wrong_secret", () => {
    const wrapped = crypto.wrapWithPassphrase(
      crypto.generateDataKey(),
      "correct horse battery",
      LOW_KDF,
    );
    expectCryptoError(
      () => crypto.unwrapWithPassphrase(wrapped, "another passphrase"),
      "wrong_secret",
    );
  });

  test("short passphrases are rejected", () => {
    expectCryptoError(
      () => crypto.wrapWithPassphrase(crypto.generateDataKey(), "short", LOW_KDF),
      "invalid_input",
    );
  });

  test("tampered ciphertext or nonce raises wrong_secret", () => {
    const wrapped = crypto.wrapWithPassphrase(
      crypto.generateDataKey(),
      "correct horse battery",
      LOW_KDF,
    );
    expectCryptoError(
      () =>
        crypto.unwrapWithPassphrase(
          { ...wrapped, ct: flipFirstChar(wrapped.ct) },
          "correct horse battery",
        ),
      "wrong_secret",
    );
    expectCryptoError(
      () =>
        crypto.unwrapWithPassphrase(
          { ...wrapped, nonce: flipFirstChar(wrapped.nonce) },
          "correct horse battery",
        ),
      "wrong_secret",
    );
  });

  test("absurd kdf limits in a wrapped blob raise invalid_input", () => {
    const wrapped = crypto.wrapWithPassphrase(
      crypto.generateDataKey(),
      "correct horse battery",
      LOW_KDF,
    );
    const oversized = { ...wrapped, memLimit: 1024 * 1024 * 1024 + 1 };
    const undersized = { ...wrapped, memLimit: 8 * 1024 * 1024 - 1 };
    const badOps = { ...wrapped, opsLimit: 0 };
    expectCryptoError(
      () => crypto.unwrapWithPassphrase(oversized, "correct horse battery"),
      "invalid_input",
    );
    expectCryptoError(
      () => crypto.unwrapWithPassphrase(undersized, "correct horse battery"),
      "invalid_input",
    );
    expectCryptoError(
      () => crypto.unwrapWithPassphrase(badOps, "correct horse battery"),
      "invalid_input",
    );
  });

  test("WrappedKey survives JSON.stringify and parse", () => {
    const key = crypto.generateDataKey();
    const wrapped = crypto.wrapWithPassphrase(key, "correct horse battery", LOW_KDF);
    const parsed = JSON.parse(JSON.stringify(wrapped)) as WrappedKey;
    expect(crypto.unwrapWithPassphrase(parsed, "correct horse battery")).toEqual(key);
  });
});

describe("recovery keys", () => {
  test("generated keys have the expected grouped format", () => {
    expect(crypto.generateRecoveryKey()).toMatch(
      /^([0-9A-HJKMNP-TV-Z]{4}-)*[0-9A-HJKMNP-TV-Z]{1,4}$/,
    );
  });

  test("round trips a data key", () => {
    const key = crypto.generateDataKey();
    const recoveryKey = crypto.generateRecoveryKey();
    const wrapped = crypto.wrapWithRecoveryKey(key, recoveryKey);
    expect(wrapped.v).toBe(1);
    expect(wrapped.kind).toBe("recovery");
    expect(wrapped.salt).toBeUndefined();
    expect(crypto.unwrapWithRecoveryKey(wrapped, recoveryKey)).toEqual(key);
  });

  test("parses lowercase, spaces and O/I/L confusables", () => {
    const key = crypto.generateDataKey();
    const recoveryKey = recoveryKeyWithZeroAndOne();
    const wrapped = crypto.wrapWithRecoveryKey(key, recoveryKey);
    expect(crypto.unwrapWithRecoveryKey(wrapped, withConfusables(recoveryKey))).toEqual(key);
  });

  test("a changed character fails the checksum", () => {
    const recoveryKey = crypto.generateRecoveryKey();
    const changedFirst = (recoveryKey[0] === "0" ? "1" : "0") + recoveryKey.slice(1);
    const changedLast = recoveryKey.slice(0, -1) + (recoveryKey.at(-1) === "0" ? "1" : "0");
    const key = crypto.generateDataKey();
    expectCryptoError(() => crypto.wrapWithRecoveryKey(key, changedFirst), "invalid_input");
    expectCryptoError(() => crypto.wrapWithRecoveryKey(key, changedLast), "invalid_input");
  });

  test("a different valid recovery key raises wrong_secret", () => {
    const wrapped = crypto.wrapWithRecoveryKey(
      crypto.generateDataKey(),
      crypto.generateRecoveryKey(),
    );
    expectCryptoError(
      () => crypto.unwrapWithRecoveryKey(wrapped, crypto.generateRecoveryKey()),
      "wrong_secret",
    );
  });

  test("WrappedKey survives JSON.stringify and parse", () => {
    const key = crypto.generateDataKey();
    const recoveryKey = crypto.generateRecoveryKey();
    const wrapped = crypto.wrapWithRecoveryKey(key, recoveryKey);
    const parsed = JSON.parse(JSON.stringify(wrapped)) as WrappedKey;
    expect(crypto.unwrapWithRecoveryKey(parsed, recoveryKey)).toEqual(key);
  });
});

describe("sealed batches", () => {
  test("round trips plaintext", () => {
    const key = crypto.generateDataKey();
    const plaintext = new TextEncoder().encode("workout, 42 minutes, café");
    const sealed = crypto.sealBatch(key, plaintext, CONTEXT);
    expect(sealed[0]).toBe(1);
    expect(sealed).toHaveLength(1 + 24 + plaintext.length + 16);
    expect(crypto.openBatch(key, sealed, CONTEXT)).toEqual(plaintext);
  });

  test("two seals of the same input differ", () => {
    const key = crypto.generateDataKey();
    const plaintext = new TextEncoder().encode("same batch");
    expect(crypto.sealBatch(key, plaintext, CONTEXT)).not.toEqual(
      crypto.sealBatch(key, plaintext, CONTEXT),
    );
  });

  test("wrong context, wrong key, flipped byte, truncation and unknown version raise tampered", () => {
    const key = crypto.generateDataKey();
    const sealed = crypto.sealBatch(key, new TextEncoder().encode("batch"), CONTEXT);
    const flipped = sealed.slice();
    flipped[10] ^= 1;
    const truncated = sealed.subarray(0, sealed.length - 1);
    const unknownVersion = sealed.slice();
    unknownVersion[0] = 2;
    expectCryptoError(() => crypto.openBatch(key, sealed, "pantry:sync:v1"), "tampered");
    expectCryptoError(
      () => crypto.openBatch(crypto.generateDataKey(), sealed, CONTEXT),
      "tampered",
    );
    expectCryptoError(() => crypto.openBatch(key, flipped, CONTEXT), "tampered");
    expectCryptoError(() => crypto.openBatch(key, truncated, CONTEXT), "tampered");
    expectCryptoError(() => crypto.openBatch(key, unknownVersion, CONTEXT), "tampered");
  });

  test("json round trip", () => {
    const key = crypto.generateDataKey();
    const value = { meals: [{ name: "café", grams: 12.5 }], ok: true, note: null };
    expect(crypto.openJson(key, crypto.sealJson(key, value, CONTEXT), CONTEXT)).toEqual(value);
  });

  test("31-byte keys are rejected everywhere", () => {
    const shortKey = crypto.generateDataKey().subarray(1);
    expect(shortKey).toHaveLength(31);
    expectCryptoError(
      () => crypto.wrapWithPassphrase(shortKey, "correct horse battery", LOW_KDF),
      "invalid_input",
    );
    expectCryptoError(
      () => crypto.wrapWithRecoveryKey(shortKey, crypto.generateRecoveryKey()),
      "invalid_input",
    );
    expectCryptoError(() => crypto.sealBatch(shortKey, new Uint8Array(), CONTEXT), "invalid_input");
    expectCryptoError(() => crypto.openBatch(shortKey, new Uint8Array(), CONTEXT), "invalid_input");
    expect(crypto.generateDataKey()).toHaveLength(KEY_BYTES);
  });
});

describe("base64 encoding", () => {
  test("wrapped blobs use URL-safe unpadded base64", () => {
    const wrapped = crypto.wrapWithPassphrase(
      crypto.generateDataKey(),
      "correct horse battery",
      LOW_KDF,
    );
    for (const field of [wrapped.salt, wrapped.nonce, wrapped.ct]) {
      expect(field).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    expect(sodium.from_base64(wrapped.nonce!, base64Variant)).toHaveLength(24);
  });
});
