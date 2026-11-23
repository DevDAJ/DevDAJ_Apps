import { Elysia } from "elysia";
import { type AuthUser, rejectGuest, requireUser } from "../../shared/auth";
import { ApiError } from "../../shared/errors";
import { getSupabaseAdmin } from "../../shared/supabase";
import { fitnexxEnv } from "./env";

/** Makes sure the shared account has a Fitnexx `user` row (usage counters, Pro flag). */
export async function ensureFitnexxUser(user: AuthUser): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("user")
    .upsert({ id: user.id, email: user.email }, { onConflict: "id" });
  if (error) throw error;
}

export async function isProUser(userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("user")
    .select("isPro")
    .eq("id", userId)
    .maybeSingle();
  return !error && data?.isPro === true;
}

/**
 * Fitnexx route options, on top of the shared DevDAJ login:
 * - `member: "<401 message>"`: signed in, with a Fitnexx `user` row ensured; adds `user`.
 *   Guests pass only while `FITNEXX_ALLOW_GUESTS=true`.
 * - `pro: true`: also requires Fitnexx Pro (403), and a full account (never guests,
 *   so purchases always belong to a recoverable account).
 */
export const fitnexxAuth = new Elysia({ name: "fitnexx.auth" })
  .macro("member", (message: string) => ({
    async resolve({ headers }) {
      const user = await requireUser(headers.authorization, {
        message,
        guests: fitnexxEnv.allowGuests,
      });
      await ensureFitnexxUser(user);
      return { user };
    },
  }))
  .macro("pro", {
    member: "Sign in to use Fitnexx Pro.",
    async resolve({ user }) {
      rejectGuest(user);
      if (!(await isProUser(user.id))) throw new ApiError(403, "Fitnexx Pro is required.");
    },
  });
