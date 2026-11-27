import { ApiError } from "../../../shared/errors";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE = /^[A-HJ-NP-Z2-9]{8}$/;

/** 8 characters from the 32-character unambiguous alphabet (32 divides 256). */
export function newInviteCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/** Accepts lower case, spaces and dashes from hand-typed codes. */
export function normalizeInviteCode(input: unknown): string {
  if (typeof input !== "string") throw new ApiError(400, "Invalid invite code.");
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (!CODE.test(code)) throw new ApiError(400, "Invalid invite code.");
  return code;
}
