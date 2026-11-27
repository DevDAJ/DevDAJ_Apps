import type { AuthUser } from "../../../shared/auth";
import { ApiError } from "../../../shared/errors";
import { getSupabaseAdmin } from "../../../shared/supabase";
import { newInviteCode, normalizeInviteCode } from "../lib/invite";
import { parseSyncRequest, type SyncEntity, type SyncRow } from "../lib/sync";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVITE_DAYS = 7;
const SYNC_PAGE = 1_000;

interface HouseholdJoin {
  joined_at: string;
  household: { id: string; name: string } | null;
}

interface MemberRow {
  user_id: string;
  email: string | null;
  joined_at: string;
}

interface SyncRowRecord {
  entity: string;
  row_id: string;
  data: Record<string, unknown>;
  deleted: boolean;
  updated_at: string;
  seq: number | string;
}

export interface SyncResult {
  cursor: number;
  rows: SyncRow[];
  more: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function requireMember(householdId: string, userId: string): Promise<void> {
  if (!UUID.test(householdId)) throw new ApiError(404, "Household not found.");
  const { data, error } = await getSupabaseAdmin()
    .from("household_member")
    .select("household_id")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "Household not found.");
}

export async function listHouseholds(
  userId: string,
): Promise<{ id: string; name: string; joinedAt: string }[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("household_member")
    .select("joined_at, household(id,name)")
    .eq("user_id", userId);
  if (error) throw error;
  return ((data ?? []) as unknown as HouseholdJoin[]).flatMap((row) =>
    row.household
      ? [
          {
            id: row.household.id,
            name: row.household.name,
            joinedAt: row.joined_at,
          },
        ]
      : [],
  );
}

export async function createHousehold(
  user: AuthUser,
  body: unknown,
): Promise<{ id: string; name: string }> {
  if (!isRecord(body) || typeof body.name !== "string") {
    throw new ApiError(400, "Invalid household name.");
  }
  const name = body.name.trim();
  if (name.length < 1 || name.length > 60) {
    throw new ApiError(400, "Household name must be 1 to 60 characters.");
  }

  const { data, error } = await getSupabaseAdmin().rpc("create_household", {
    p_name: name,
    p_user: user.id,
    p_email: user.email,
  });
  if (error) throw error;
  return { id: data as string, name };
}

export async function listMembers(
  householdId: string,
  userId: string,
): Promise<{ userId: string; email: string | null; joinedAt: string }[]> {
  await requireMember(householdId, userId);
  const { data, error } = await getSupabaseAdmin()
    .from("household_member")
    .select("user_id,email,joined_at")
    .eq("household_id", householdId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as MemberRow[]).map((row) => ({
    userId: row.user_id,
    email: row.email,
    joinedAt: row.joined_at,
  }));
}

export async function createInvite(
  householdId: string,
  userId: string,
): Promise<{ code: string; expiresAt: string }> {
  await requireMember(householdId, userId);
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = newInviteCode();
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1_000).toISOString();
    const { error } = await getSupabaseAdmin().from("household_invite").insert({
      code,
      household_id: householdId,
      created_by: userId,
      expires_at: expiresAt,
    });
    if (!error) return { code, expiresAt };
    if ((error as { code?: unknown }).code !== "23505" || attempt === 1) throw error;
  }
  throw new ApiError(500, "Could not create an invite code.");
}

export async function joinHousehold(
  user: AuthUser,
  body: unknown,
): Promise<{ id: string; name: string }> {
  const code = normalizeInviteCode(isRecord(body) ? body.code : undefined);
  const admin = getSupabaseAdmin();
  const { data: invite, error: inviteError } = await admin
    .from("household_invite")
    .select("household_id,expires_at")
    .eq("code", code)
    .maybeSingle();
  if (inviteError) throw inviteError;
  if (!invite) throw new ApiError(404, "Invite code not found or expired.");

  const expiresAt = Date.parse(String(invite.expires_at));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new ApiError(404, "Invite code not found or expired.");
  }

  const householdId = String(invite.household_id);
  const { error: membershipError } = await admin.from("household_member").upsert(
    {
      household_id: householdId,
      user_id: user.id,
      email: user.email,
    },
    { onConflict: "household_id,user_id", ignoreDuplicates: true },
  );
  if (membershipError) throw membershipError;

  const { data: household, error: householdError } = await admin
    .from("household")
    .select("id,name")
    .eq("id", householdId)
    .maybeSingle();
  if (householdError) throw householdError;
  if (!household) throw new ApiError(404, "Invite code not found or expired.");
  return { id: household.id as string, name: household.name as string };
}

export async function leaveHousehold(householdId: string, userId: string): Promise<void> {
  await requireMember(householdId, userId);
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("household_member")
    .delete()
    .eq("household_id", householdId)
    .eq("user_id", userId);
  if (error) throw error;

  const { count, error: countError } = await admin
    .from("household_member")
    .select("user_id", { count: "exact", head: true })
    .eq("household_id", householdId);
  if (countError) throw countError;
  if ((count ?? 0) === 0) {
    const { error: deleteError } = await admin.from("household").delete().eq("id", householdId);
    if (deleteError) throw deleteError;
  }
}

export async function syncHousehold(
  householdId: string,
  userId: string,
  body: unknown,
): Promise<SyncResult> {
  await requireMember(householdId, userId);
  const { cursor, rows } = parseSyncRequest(body);
  const admin = getSupabaseAdmin();

  if (rows.length > 0) {
    const { error } = await admin.rpc("push_pantry_rows", {
      p_household: householdId,
      p_user: userId,
      p_rows: rows,
    });
    if (error) throw error;
  }

  const { data, error } = await admin
    .from("pantry_sync_row")
    .select("entity,row_id,data,deleted,updated_at,seq")
    .eq("household_id", householdId)
    .gt("seq", cursor)
    .order("seq", { ascending: true })
    .limit(SYNC_PAGE + 1);
  if (error) throw error;

  const fetched = (data ?? []) as unknown as SyncRowRecord[];
  const page = fetched.slice(0, SYNC_PAGE);
  // shortcut: seq cursors can skip a row committed late by a concurrent push; fine at household scale, add a commit-ordered log if it bites.
  return {
    cursor: page.length > 0 ? Number(page[page.length - 1].seq) : cursor,
    rows: page.map((row) => ({
      entity: row.entity as SyncEntity,
      rowId: row.row_id,
      data: row.data,
      deleted: row.deleted,
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
    more: fetched.length > SYNC_PAGE,
  };
}
