import { Elysia } from "elysia";
import { ApiError } from "./errors";
import { getSupabase } from "./supabase";

/** The signed-in DevDAJ account, from a verified Supabase access token. */
export interface AuthUser {
  id: string;
  email: string | null;
  /** A Supabase anonymous (guest) user. Same id is kept if they upgrade to a full account. */
  isGuest: boolean;
}

export interface AuthOptions {
  /** 401 message when there's no valid session. */
  message: string;
  /** Let guest (anonymous) users through. Off by default. */
  guests?: boolean;
}

/** 403 body sent to guests on account-only routes; clients can offer an upgrade on this code. */
export const ACCOUNT_REQUIRED = {
  message: "Create a free account to use this.",
  code: "account_required",
} as const;

/**
 * Verifies `Authorization: Bearer <supabase access token>`.
 * `getClaims` checks the JWT locally when the project uses asymmetric signing keys
 * and falls back to asking Supabase Auth otherwise.
 */
export async function verifyBearer(authorization: string | undefined): Promise<AuthUser | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;
  const { data, error } = await getSupabase().auth.getClaims(token);
  if (error || !data?.claims.sub) return null;
  const { email, is_anonymous } = data.claims;
  return {
    id: data.claims.sub,
    email: typeof email === "string" ? email : null,
    isGuest: is_anonymous === true,
  };
}

/** Throws 403 `account_required` for guests. */
export function rejectGuest(user: AuthUser): void {
  if (user.isGuest) {
    throw new ApiError(403, ACCOUNT_REQUIRED.message, { code: ACCOUNT_REQUIRED.code });
  }
}

/** `verifyBearer` that throws 401 without a session, and 403 for guests unless `guests` is on. */
export async function requireUser(
  authorization: string | undefined,
  options: AuthOptions | string,
): Promise<AuthUser> {
  const { message, guests = false } = typeof options === "string" ? { message: options } : options;
  const user = await verifyBearer(authorization);
  if (!user) throw new ApiError(401, message);
  if (!guests) rejectGuest(user);
  return user;
}

/**
 * Shared login for every app's routes. Adds `user: AuthUser`.
 * - `auth: "<401 message>"`: full accounts only (guests get 403 `account_required`).
 * - `auth: { message, guests: true }`: guests allowed too.
 */
export const sessionAuth = new Elysia({ name: "shared.auth" }).macro(
  "auth",
  (options: AuthOptions | string) => ({
    resolve: async ({ headers }) => ({ user: await requireUser(headers.authorization, options) }),
  }),
);
