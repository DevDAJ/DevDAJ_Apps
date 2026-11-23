import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

vi.mock("../shared/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getClaims: async (token: string) =>
        token.startsWith("good-")
          ? { data: { claims: { sub: token.slice(5), email: "a@b.test" } }, error: null }
          : { data: null, error: new Error("bad jwt") },
    },
  }),
  getSupabaseAdmin: () => {
    throw new Error("not used");
  },
}));

const { app } = await import("../app");
const call = (path: string, token?: string) =>
  app.handle(
    new Request(`http://localhost/api${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );

describe("admin routes", () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = "boss, other";
    delete process.env.VITE_ADMIN_DEV_BYPASS;
  });

  test("dev bypass skips sign-in when opted in", async () => {
    process.env.VITE_ADMIN_DEV_BYPASS = "true";
    const res = await call("/v1/admin/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "00000000-0000-0000-0000-000000000000",
      email: "dev-admin@localhost",
    });
  });

  test("need a session", async () => {
    const res = await call("/v1/admin/me");
    expect(res.status).toBe(401);
  });

  test("reject non-admins", async () => {
    const res = await call("/v1/admin/metrics", "good-someone");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin access is required." });
  });

  test("allow listed admins", async () => {
    const res = await call("/v1/admin/me", "good-boss");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "boss", email: "a@b.test" });
  });

  test("contributions need a session", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/dataset/contributions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in to contribute." });
  });
});
