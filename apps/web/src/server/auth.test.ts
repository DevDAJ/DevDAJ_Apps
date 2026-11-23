import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

// Fake shared Supabase project: "good-<id>" is a full account, "guest-<id>" an anonymous
// (guest) user, anything else is rejected.
const calls: string[] = [];
let isPro = false;

vi.mock("./shared/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getClaims: async (token: string) => {
        if (token.startsWith("good-")) {
          return { data: { claims: { sub: token.slice(5), email: "a@b.test" } }, error: null };
        }
        if (token.startsWith("guest-")) {
          return { data: { claims: { sub: token.slice(6), is_anonymous: true } }, error: null };
        }
        return { data: null, error: new Error("bad jwt") };
      },
    },
  }),
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert: async (row: { id: string }) => {
        calls.push(`upsert:${row.id}`);
        return { error: null };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            calls.push("select:isPro");
            return { data: { isPro }, error: null };
          },
        }),
      }),
    }),
  }),
}));

const { app } = await import("./app");
const models = (token?: string) =>
  app.handle(
    new Request("http://localhost/api/v1/fitnexx/ai/models", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );

describe("shared login + fitnexx pro", () => {
  beforeEach(() => {
    calls.length = 0;
    isPro = false;
  });

  test("an invalid token is a 401 and never touches Fitnexx data", async () => {
    const res = await models("forged");
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  test("a valid account without Pro gets 403, after its Fitnexx row is ensured", async () => {
    const res = await models("good-user-1");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Fitnexx Pro is required." });
    expect(calls).toEqual(["upsert:user-1", "select:isPro"]);
  });

  test("a Pro account passes auth and gets the model catalog", async () => {
    isPro = true;
    const res = await models("good-user-2");
    expect(res.status).toBe(200);
    const catalog = (await res.json()) as Array<{ id: string; name: string }>;
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog[0].id).toContain("/");
  });
});

describe("guests (toggled per app)", () => {
  const usage = (token: string) =>
    app.handle(
      new Request("http://localhost/api/v1/fitnexx/food-analysis", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
  const accountRequired = { error: "Create a free account to use this.", code: "account_required" };

  beforeEach(() => {
    calls.length = 0;
    isPro = false;
  });

  test("with FITNEXX_ALLOW_GUESTS off, guests get 403 before any Fitnexx data is touched", async () => {
    process.env.FITNEXX_ALLOW_GUESTS = "false";
    const res = await usage("guest-g1");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(accountRequired);
    expect(calls).toEqual([]);
  });

  test("with FITNEXX_ALLOW_GUESTS on, guests sign in but get no food-analysis allowance", async () => {
    process.env.FITNEXX_ALLOW_GUESTS = "true";
    const res = await usage("guest-g2");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isPro: false, limit: 0, remaining: 0 });
    expect(calls).not.toContain("select:isPro");
  });

  test.each(["PUT", "POST"])("guests can't %s food analysis", async (method) => {
    process.env.FITNEXX_ALLOW_GUESTS = "true";
    const res = await app.handle(
      new Request("http://localhost/api/v1/fitnexx/food-analysis", {
        method,
        headers: { authorization: "Bearer guest-g4", "content-type": "application/json" },
        body: JSON.stringify({ scanId: "00000000-0000-4000-8000-000000000000" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(accountRequired);
  });

  test("full accounts still get the free allowance", async () => {
    const res = await usage("good-user-5");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isPro: false, limit: 10, remaining: 10 });
  });

  test("Pro routes never accept guests, even when guests are on", async () => {
    process.env.FITNEXX_ALLOW_GUESTS = "true";
    isPro = true;
    const res = await models("guest-g3");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(accountRequired);
    expect(calls).not.toContain("select:isPro");
  });
});
