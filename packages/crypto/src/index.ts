/** The libsodium.js functions this package uses (libsodium-wrappers-sumo and react-native-libsodium both match). */
export interface Sodium {
  ready?: Promise<unknown>;
  randombytes_buf(length: number): Uint8Array;
  crypto_pwhash(
    keyLength: number,
    password: Uint8Array,
    salt: Uint8Array,
    opsLimit: number,
    memLimit: number,
    algorithm: number,
  ): Uint8Array;
  crypto_pwhash_SALTBYTES: number;
  crypto_pwhash_ALG_ARGON2ID13: number;
  crypto_aead_xchacha20poly1305_ietf_encrypt(
    message: Uint8Array,
    additionalData: Uint8Array | null,
    secretNonce: null,
    publicNonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array;
  crypto_aead_xchacha20poly1305_ietf_decrypt(
    secretNonce: null,
    ciphertext: Uint8Array,
    additionalData: Uint8Array | null,
    publicNonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array;
  crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: number;
  crypto_generichash(hashLength: number, message: Uint8Array, key: Uint8Array | null): Uint8Array;
  to_base64(input: Uint8Array, variant?: number): string;
  from_base64(input: string, variant?: number): Uint8Array;
  base64_variants: { URLSAFE_NO_PADDING: number };
}

/** Size of a data key or derived wrapping key, in bytes. */
export const KEY_BYTES = 32;

/** Default Argon2id cost: 3 passes over 64 MiB (phone friendly; stored per wrapped key so it can be raised later). */
export const DEFAULT_KDF = { opsLimit: 3, memLimit: 64 * 1024 * 1024 } as const;

/** A JSON-safe wrapped data key, with passphrase KDF settings or just a recovery-key nonce and ciphertext. */
export interface WrappedKey {
  v: 1;
  kind: "passphrase" | "recovery";
  salt?: string;
  opsLimit?: number;
  memLimit?: number;
  nonce: string;
  ct: string;
}

/** An encryption failure with a stable code: wrong_secret, invalid_input or tampered. */
export class CryptoError extends Error {
  constructor(
    message: string,
    public code: "wrong_secret" | "invalid_input" | "tampered",
  ) {
    super(message);
    this.name = "CryptoError";
  }
}

const utf8 = new TextEncoder();
const utf8Decoder = new TextDecoder();
// NFKC so the same passphrase typed on another keyboard or platform derives the same key.
const passphraseBytes = (passphrase: string): Uint8Array =>
  utf8.encode(passphrase.normalize("NFKC"));
const PASSPHRASE_AD = utf8.encode("devdaj-key-v1:passphrase");
const RECOVERY_AD = utf8.encode("devdaj-key-v1:recovery");
const BATCH_AD_PREFIX = "devdaj-batch-v1:";
const BATCH_VERSION = 1;
const BATCH_NONCE_BYTES = 24;
const MIN_PASSPHRASE_LENGTH = 8;
const MIN_KDF_MEM = 8 * 1024 * 1024;
const MAX_KDF_MEM = 1024 * 1024 * 1024;
const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECOVERY_KEY_BYTES = KEY_BYTES;
const RECOVERY_CHECKSUM_BYTES = 2;
const RECOVERY_TOTAL_BYTES = RECOVERY_KEY_BYTES + RECOVERY_CHECKSUM_BYTES;
const RECOVERY_CHARS = Math.ceil((RECOVERY_TOTAL_BYTES * 8) / 5);

function assertDataKey(dataKey: Uint8Array): void {
  if (dataKey.length !== KEY_BYTES) {
    throw new CryptoError("Data key must be 32 bytes", "invalid_input");
  }
}

function assertWrappedKind(wrapped: WrappedKey, kind: WrappedKey["kind"]): void {
  if (!wrapped || wrapped.v !== 1 || wrapped.kind !== kind) {
    throw new CryptoError("Invalid wrapped key", "invalid_input");
  }
}

function encodeCrockford(bytes: Uint8Array): string {
  let encoded = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += RECOVERY_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) {
    encoded += RECOVERY_ALPHABET[(buffer << (5 - bits)) & 31];
  }
  return encoded;
}

/** Build a crypto client from an initialized libsodium object. Await `sodium.ready` before calling this. */
export function createCrypto(sodium: Sodium): {
  generateDataKey(): Uint8Array;
  wrapWithPassphrase(
    dataKey: Uint8Array,
    passphrase: string,
    kdf?: { opsLimit: number; memLimit: number },
  ): WrappedKey;
  unwrapWithPassphrase(wrapped: WrappedKey, passphrase: string): Uint8Array;
  generateRecoveryKey(): string;
  wrapWithRecoveryKey(dataKey: Uint8Array, recoveryKey: string): WrappedKey;
  unwrapWithRecoveryKey(wrapped: WrappedKey, recoveryKey: string): Uint8Array;
  sealBatch(dataKey: Uint8Array, plaintext: Uint8Array, context: string): Uint8Array;
  openBatch(dataKey: Uint8Array, sealed: Uint8Array, context: string): Uint8Array;
  sealJson(dataKey: Uint8Array, value: unknown, context: string): Uint8Array;
  openJson(dataKey: Uint8Array, sealed: Uint8Array, context: string): unknown;
} {
  const base64Variant = sodium.base64_variants.URLSAFE_NO_PADDING;

  function decodeRecoveryKey(recoveryKey: string): Uint8Array {
    const normalized = recoveryKey
      .toUpperCase()
      .replace(/[\s-]/g, "")
      .replace(/O/g, "0")
      .replace(/[IL]/g, "1");
    const invalid = () => new CryptoError("Invalid recovery key", "invalid_input");
    if (normalized.length !== RECOVERY_CHARS) {
      throw invalid();
    }
    const bytes: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (const char of normalized) {
      const value = RECOVERY_ALPHABET.indexOf(char);
      if (value < 0) {
        throw invalid();
      }
      buffer = (buffer << 5) | value;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >>> bits) & 0xff);
      }
    }
    const decoded = new Uint8Array(bytes);
    if (decoded.length !== RECOVERY_TOTAL_BYTES || encodeCrockford(decoded) !== normalized) {
      throw invalid();
    }
    const checksum = sodium.crypto_generichash(
      RECOVERY_CHECKSUM_BYTES,
      decoded.subarray(0, RECOVERY_KEY_BYTES),
      null,
    );
    for (let i = 0; i < checksum.length; i++) {
      if (checksum[i] !== decoded[RECOVERY_KEY_BYTES + i]) {
        throw invalid();
      }
    }
    return decoded.subarray(0, RECOVERY_KEY_BYTES);
  }

  function encryptKey(
    dataKey: Uint8Array,
    wrappingKey: Uint8Array,
    additionalData: Uint8Array,
    kind: WrappedKey["kind"],
  ): WrappedKey {
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      dataKey,
      additionalData,
      null,
      nonce,
      wrappingKey,
    );
    return {
      v: 1,
      kind,
      nonce: sodium.to_base64(nonce, base64Variant),
      ct: sodium.to_base64(ct, base64Variant),
    };
  }

  function sealBatchImpl(dataKey: Uint8Array, plaintext: Uint8Array, context: string): Uint8Array {
    assertDataKey(dataKey);
    const nonce = sodium.randombytes_buf(BATCH_NONCE_BYTES);
    const additionalData = utf8.encode(BATCH_AD_PREFIX + context);
    const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintext,
      additionalData,
      null,
      nonce,
      dataKey,
    );
    const sealed = new Uint8Array(1 + nonce.length + ct.length);
    sealed[0] = BATCH_VERSION;
    sealed.set(nonce, 1);
    sealed.set(ct, 1 + nonce.length);
    return sealed;
  }

  function openBatchImpl(dataKey: Uint8Array, sealed: Uint8Array, context: string): Uint8Array {
    assertDataKey(dataKey);
    try {
      if (sealed.length < 1 + BATCH_NONCE_BYTES + 16 || sealed[0] !== BATCH_VERSION) {
        throw new Error("invalid batch header");
      }
      const nonce = sealed.subarray(1, 1 + BATCH_NONCE_BYTES);
      const ct = sealed.subarray(1 + BATCH_NONCE_BYTES);
      const additionalData = utf8.encode(BATCH_AD_PREFIX + context);
      return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        ct,
        additionalData,
        nonce,
        dataKey,
      );
    } catch {
      throw new CryptoError("Batch could not be opened", "tampered");
    }
  }

  function decryptKey(
    wrapped: WrappedKey,
    wrappingKey: Uint8Array,
    additionalData: Uint8Array,
    wrongSecretMessage: string,
  ): Uint8Array {
    let nonce: Uint8Array;
    let ct: Uint8Array;
    try {
      if (typeof wrapped.nonce !== "string" || typeof wrapped.ct !== "string") {
        throw new Error("missing ciphertext");
      }
      nonce = sodium.from_base64(wrapped.nonce, base64Variant);
      ct = sodium.from_base64(wrapped.ct, base64Variant);
    } catch {
      throw new CryptoError(wrongSecretMessage, "wrong_secret");
    }
    try {
      return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        ct,
        additionalData,
        nonce,
        wrappingKey,
      );
    } catch {
      throw new CryptoError(wrongSecretMessage, "wrong_secret");
    }
  }

  return {
    /** Generate a fresh 32-byte data key. */
    generateDataKey() {
      return sodium.randombytes_buf(KEY_BYTES);
    },

    /** Wrap a data key with a passphrase using Argon2id13 and XChaCha20-Poly1305. */
    wrapWithPassphrase(dataKey, passphrase, kdf = DEFAULT_KDF) {
      assertDataKey(dataKey);
      if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        throw new CryptoError("Passphrase must be at least 8 characters", "invalid_input");
      }
      const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
      const wrappingKey = sodium.crypto_pwhash(
        KEY_BYTES,
        passphraseBytes(passphrase),
        salt,
        kdf.opsLimit,
        kdf.memLimit,
        sodium.crypto_pwhash_ALG_ARGON2ID13,
      );
      const wrapped = encryptKey(dataKey, wrappingKey, PASSPHRASE_AD, "passphrase");
      return {
        ...wrapped,
        salt: sodium.to_base64(salt, base64Variant),
        opsLimit: kdf.opsLimit,
        memLimit: kdf.memLimit,
      } satisfies WrappedKey;
    },

    /** Unwrap a passphrase-wrapped data key; a wrong passphrase raises wrong_secret. */
    unwrapWithPassphrase(wrapped, passphrase) {
      assertWrappedKind(wrapped, "passphrase");
      if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        throw new CryptoError("Passphrase must be at least 8 characters", "invalid_input");
      }
      const { opsLimit, memLimit } = wrapped;
      if (
        typeof opsLimit !== "number" ||
        typeof memLimit !== "number" ||
        !Number.isFinite(opsLimit) ||
        !Number.isFinite(memLimit) ||
        opsLimit < 1 ||
        memLimit < MIN_KDF_MEM ||
        memLimit > MAX_KDF_MEM
      ) {
        throw new CryptoError("Invalid wrapped key", "invalid_input");
      }
      let salt: Uint8Array;
      try {
        if (typeof wrapped.salt !== "string") {
          throw new Error("missing salt");
        }
        salt = sodium.from_base64(wrapped.salt, base64Variant);
      } catch {
        throw new CryptoError("Wrong passphrase", "wrong_secret");
      }
      const wrappingKey = sodium.crypto_pwhash(
        KEY_BYTES,
        passphraseBytes(passphrase),
        salt,
        opsLimit,
        memLimit,
        sodium.crypto_pwhash_ALG_ARGON2ID13,
      );
      return decryptKey(wrapped, wrappingKey, PASSPHRASE_AD, "Wrong passphrase");
    },

    /** Generate a grouped, checksummed Crockford base32 recovery key. */
    generateRecoveryKey() {
      const keyBytes = sodium.randombytes_buf(RECOVERY_KEY_BYTES);
      const checksum = sodium.crypto_generichash(RECOVERY_CHECKSUM_BYTES, keyBytes, null);
      const combined = new Uint8Array(RECOVERY_TOTAL_BYTES);
      combined.set(keyBytes, 0);
      combined.set(checksum, RECOVERY_KEY_BYTES);
      const encoded = encodeCrockford(combined);
      const groups: string[] = [];
      for (let i = 0; i < encoded.length; i += 4) {
        groups.push(encoded.slice(i, i + 4));
      }
      return groups.join("-");
    },

    /** Wrap a data key directly with a full-entropy recovery key. */
    wrapWithRecoveryKey(dataKey, recoveryKey) {
      assertDataKey(dataKey);
      return encryptKey(dataKey, decodeRecoveryKey(recoveryKey), RECOVERY_AD, "recovery");
    },

    /** Unwrap a recovery-key-wrapped data key; a wrong key raises wrong_secret. */
    unwrapWithRecoveryKey(wrapped, recoveryKey) {
      assertWrappedKind(wrapped, "recovery");
      return decryptKey(wrapped, decodeRecoveryKey(recoveryKey), RECOVERY_AD, "Wrong recovery key");
    },

    /** Seal plaintext as a versioned nonce-prefixed batch bound to a context string. */
    sealBatch(dataKey, plaintext, context) {
      return sealBatchImpl(dataKey, plaintext, context);
    },

    /** Open a sealed batch; version, size, auth, context and key failures all raise tampered. */
    openBatch(dataKey, sealed, context) {
      return openBatchImpl(dataKey, sealed, context);
    },

    /** JSON.stringify a value, UTF-8 encode it and seal it for a context. */
    sealJson(dataKey, value, context) {
      return sealBatchImpl(dataKey, utf8.encode(JSON.stringify(value)), context);
    },

    /** Open a sealed batch, UTF-8 decode it and JSON.parse the result. */
    openJson(dataKey, sealed, context) {
      return JSON.parse(utf8Decoder.decode(openBatchImpl(dataKey, sealed, context))) as unknown;
    },
  };
}
