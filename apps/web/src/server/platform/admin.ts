import { Elysia } from "elysia";
import { type AuthUser, requireUser } from "../shared/auth";
import { ApiError } from "../shared/errors";

/** Supabase user ids allowed into the admin dashboard (`ADMIN_USER_IDS`, comma-separated). */
export function adminIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function isAdmin(user: AuthUser): boolean {
  return adminIds().has(user.id);
}

/**
 * Local development only: `VITE_ADMIN_DEV_BYPASS=true` under `vp dev` lets anyone into the admin
 * API. `import.meta.env.DEV` is replaced with `false` in production builds, so the bypass is
 * compiled out there whatever the environment says.
 */
export function adminDevBypass(): boolean {
  return import.meta.env.DEV === true && process.env.VITE_ADMIN_DEV_BYPASS === "true";
}

/** Who the bypass acts as. Set `ADMIN_DEV_USER_ID` to a real user id to approve or reject. */
function devAdmin(): AuthUser {
  return {
    id: process.env.ADMIN_DEV_USER_ID || "00000000-0000-0000-0000-000000000000",
    email: "dev-admin@localhost",
    isGuest: false,
  };
}

/** `admin: true`: a full account listed in `ADMIN_USER_IDS` (403 otherwise). Adds `user`. */
export const adminAuth = new Elysia({ name: "platform.admin" }).macro("admin", {
  async resolve({ headers }) {
    if (adminDevBypass()) return { user: devAdmin() };
    const user = await requireUser(headers.authorization, "Sign in as an admin.");
    if (!isAdmin(user)) throw new ApiError(403, "Admin access is required.");
    return { user };
  },
});
