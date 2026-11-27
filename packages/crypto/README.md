# @devdaj/crypto

End-to-end encryption primitives shared by every DevDAJ app: a data key,
passphrase and recovery-key wrapping, and sealed sync batches. Headless, with
no runtime dependencies, no UI and no app-specific types. The app injects
libsodium, so the same API runs on phones, in browsers and in Node.

## What it does

- Generates a 32-byte random data key that never leaves the device unencrypted.
- Wraps that key with a passphrase (Argon2id13 plus XChaCha20-Poly1305) or with
  a full-entropy recovery key (XChaCha20-Poly1305 only).
- Seals sync batches with XChaCha20-Poly1305 and binds each batch to a caller
  supplied context string, so a batch cannot be replayed into another app or
  segment.

## Usage

Await libsodium before creating the client. `createCrypto` itself is
synchronous.

On native (`react-native-libsodium`):

```ts
import sodium from "react-native-libsodium";
import { createCrypto } from "@devdaj/crypto";

await sodium.ready;
const crypto = createCrypto(sodium);
```

On web and Node (`libsodium-wrappers-sumo`):

```ts
import sodium from "libsodium-wrappers-sumo";
import { createCrypto } from "@devdaj/crypto";

await sodium.ready;
const crypto = createCrypto(sodium);
```

Typical key lifecycle:

```ts
const dataKey = crypto.generateDataKey();
const passphraseWrapped = crypto.wrapWithPassphrase(dataKey, usersPassphrase);
const recoveryKey = crypto.generateRecoveryKey();
const recoveryWrapped = crypto.wrapWithRecoveryKey(dataKey, recoveryKey);

const restored = crypto.unwrapWithPassphrase(passphraseWrapped, usersPassphrase);
const sealed = crypto.sealJson(restored, { workouts: [] }, "fitnexx:sync:v1");
const batch = crypto.openJson(restored, sealed, "fitnexx:sync:v1");
```

`WrappedKey` is plain JSON, so wrap objects can be stored in AsyncStorage or
sent to a server without extra encoding. Base64 fields use the URL-safe,
unpadded variant. Strings are UTF-8 encoded with `TextEncoder` and
`TextDecoder`. Every random byte comes from `sodium.randombytes_buf`; there is
no `Math.random`.

## API

| Export                                        | Purpose                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| `createCrypto(sodium)`                        | Build the synchronous crypto client from an initialized libsodium object.         |
| `generateDataKey()`                           | Generate a fresh 32-byte data key.                                                |
| `wrapWithPassphrase(key, passphrase, kdf?)`   | Argon2id wrap; rejects passphrases under 8 characters. Defaults to `DEFAULT_KDF`. |
| `unwrapWithPassphrase(wrapped, passphrase)`   | Derive the key and decrypt; wrong secret raises `wrong_secret`.                   |
| `generateRecoveryKey()`                       | Generate a grouped, checksummed Crockford base32 recovery key.                    |
| `wrapWithRecoveryKey(key, recoveryKey)`       | Wrap directly with the full-entropy recovery key, without a KDF.                  |
| `unwrapWithRecoveryKey(wrapped, recoveryKey)` | Decrypt with a recovery key; parsing failures raise `invalid_input`.              |
| `sealBatch(key, plaintext, context)`          | Seal bytes as version 1, 24-byte nonce, then ciphertext.                          |
| `openBatch(key, sealed, context)`             | Verify and decrypt a batch; any failure raises `tampered`.                        |
| `sealJson(key, value, context)`               | JSON encode, UTF-8 encode and seal a value.                                       |
| `openJson(key, sealed, context)`              | Open, UTF-8 decode and JSON parse a sealed value.                                 |
| `DEFAULT_KDF`                                 | 3 passes over 64 MiB, stored per wrapped key so it can be raised later.           |
| `KEY_BYTES`                                   | Required length of a data key (32).                                               |
| `CryptoError`                                 | Error with a `code`: `wrong_secret`, `invalid_input` or `tampered`.               |
| `Sodium`, `WrappedKey`                        | Types for the injected libsodium object and the JSON-safe wrapped key.            |

## Threat notes

- There is no reset. Lose both the passphrase and the recovery key and the
  data is gone. Keep the recovery key offline and tell users this before they
  enable encryption.
- Context strings must be unique per app and segment, for example
  `fitnexx:sync:v1`. Reusing a context lets a batch from one place be replayed
  into another.
- Recovery keys have a 2-byte checksum that catches typos, not brute force.
  The 32 random bytes are the secret. Parsing accepts lowercase and common
  confusables (`O` becomes `0`, `I` and `L` become `1`).
- Unwrapping rejects stored KDF costs below 1 pass or outside 8 MiB to 1 GiB
  of memory, so a tampered blob cannot force a huge allocation. Raise the cost
  on new wraps as devices get faster; old wrapped keys keep their own settings.
- The package does not store keys, manage accounts or talk to a server. Each
  app owns storage, backup policy and key recovery UX.

## Development

From `packages/crypto`: `bunx vp test` and `bunx tsc --noEmit`. From the repo
root: `bun run ready` is the full gate.
