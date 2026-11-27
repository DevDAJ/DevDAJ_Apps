import { createHmac } from "node:crypto";
import { describe, expect, test } from "vite-plus/test";
import { app } from "./app";

const base = "http://localhost/api";
const call = (path: string, init?: RequestInit) => app.handle(new Request(`${base}${path}`, init));
const json = (method: string, body: unknown, headers: Record<string, string> = {}) => ({
  method,
  headers: { "content-type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

describe("api", () => {
  test("health", async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("unknown routes use the shared error shape", async () => {
    const res = await call("/v1/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found." });
  });
});

describe("fitnexx v1 auth", () => {
  test.each([
    ["GET", "/v1/fitnexx/ai/models?provider=openai", "Sign in to use Fitnexx Pro."],
    ["POST", "/v1/fitnexx/ai/chat", "Sign in to use Fitnexx Pro."],
    ["GET", "/v1/fitnexx/food-analysis", "Sign in to use food analysis."],
    ["POST", "/v1/fitnexx/food-analysis", "Sign in to use food analysis."],
    ["PUT", "/v1/fitnexx/food-analysis", "Sign in to use food analysis."],
    ["DELETE", "/v1/fitnexx/food-analysis", "Sign in to delete a food scan."],
  ])("%s %s requires a bearer token", async (method, path, message) => {
    const init = method === "GET" ? { method } : json(method, {});
    const res = await call(path, init);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: message });
  });

  test("food-analysis responses are never cached, errors included", async () => {
    const res = await call("/v1/fitnexx/food-analysis");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await call("/health")).headers.get("cache-control")).toBeNull();
  });
});

describe("pantry v1 auth", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const message = "Sign in to use Pantry Helper.";

  test.each([
    ["GET", "/v1/pantry/households", message],
    ["POST", "/v1/pantry/households", message],
    ["POST", "/v1/pantry/households/join", message],
    ["GET", `/v1/pantry/households/${id}/members`, message],
    ["POST", `/v1/pantry/households/${id}/invites`, message],
    ["DELETE", `/v1/pantry/households/${id}/members/me`, message],
    ["POST", `/v1/pantry/households/${id}/sync`, message],
    ["GET", `/v1/pantry/households/${id}/imports`, message],
    ["POST", `/v1/pantry/households/${id}/imports`, message],
    ["POST", "/v1/pantry/recipes/parse", message],
  ])("%s %s requires a bearer token", async (method, path, expected) => {
    const init = method === "GET" ? { method } : json(method, {});
    const res = await call(path, init);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expected });
  });
});

describe("fitnexx v1 body limits", () => {
  test("rejects oversized JSON with 413", async () => {
    const res = await call("/v1/fitnexx/food-analysis", json("PUT", { pad: "x".repeat(3_000) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Request is too large." });
  });

  test("rejects malformed JSON with 400", async () => {
    const res = await call("/v1/fitnexx/food-analysis", json("PUT", "{nope"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON." });
  });
});

describe("fitnexx v1 revenuecat webhook", () => {
  const path = "/v1/fitnexx/webhooks/revenuecat";
  const body = JSON.stringify({ event: { type: "TEST" } });

  test("rejects a missing or bad signature", async () => {
    process.env.FITNEXX_REVENUECAT_WEBHOOK_SECRET = "secret";
    const res = await call(
      path,
      json("POST", body, { "x-revenuecat-webhook-signature": "t=1,v1=bad" }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid signature." });
  });

  test("verifies the signature against the raw body", async () => {
    process.env.FITNEXX_REVENUECAT_WEBHOOK_SECRET = "secret";
    delete process.env.FITNEXX_REVENUECAT_SECRET_API_KEY;
    const t = Math.floor(Date.now() / 1_000);
    const v1 = createHmac("sha256", "secret").update(`${t}.${body}`).digest("hex");
    const res = await call(
      path,
      json("POST", body, { "x-revenuecat-webhook-signature": `t=${t},v1=${v1}` }),
    );
    // Signature passed; stops at the (unset) RevenueCat API key before touching Supabase.
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "RevenueCat API is not configured." });
  });
});
