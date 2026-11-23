/** Minimal JWT signing with WebCrypto, for Google (RS256) and App Store Connect (ES256). */

const encoder = new TextEncoder();

export function base64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? encoder.encode(input) : new Uint8Array(input as ArrayBuffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PKCS#8 PEM ("-----BEGIN PRIVATE KEY-----") to DER bytes. Accepts literal `\n` escapes. */
export function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function signJwt(
  alg: "RS256" | "ES256",
  privateKeyPem: string,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> {
  const params =
    alg === "RS256"
      ? {
          import: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          sign: { name: "RSASSA-PKCS1-v1_5" },
        }
      : {
          import: { name: "ECDSA", namedCurve: "P-256" },
          sign: { name: "ECDSA", hash: "SHA-256" },
        };
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKeyPem),
    params.import,
    false,
    ["sign"],
  );
  const input = `${base64url(JSON.stringify({ ...header, alg, typ: "JWT" }))}.${base64url(JSON.stringify(payload))}`;
  // WebCrypto ECDSA signatures are already raw r||s, which is what JWS ES256 expects.
  const signature = await crypto.subtle.sign(params.sign, key, encoder.encode(input));
  return `${input}.${base64url(signature)}`;
}
