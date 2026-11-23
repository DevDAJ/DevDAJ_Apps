import { describe, expect, test } from "vite-plus/test";
import { createAuth, DevdajAuthError, isGuestUser, parseAuthCallback, toAuthError } from "./index";

describe("parseAuthCallback", () => {
  test("reads the PKCE code from the query string", () => {
    expect(parseAuthCallback("fitnexx://auth/callback?code=abc")).toEqual({ code: "abc" });
  });

  test("reads provider errors from the hash fragment", () => {
    expect(
      parseAuthCallback("fitnexx://auth/callback#error=access_denied&error_description=Nope"),
    ).toEqual({ error: "access_denied", description: "Nope" });
  });

  test("prefers error_code over error", () => {
    expect(
      parseAuthCallback("https://a.test/cb?error=server_error&error_code=bad_oauth_state"),
    ).toEqual({ error: "bad_oauth_state", description: undefined });
  });

  test("flags missing codes and garbage", () => {
    expect(parseAuthCallback("https://a.test/cb")).toEqual({ error: "missing_code" });
    expect(parseAuthCallback("not a url")).toEqual({ error: "invalid_callback" });
  });
});

describe("toAuthError", () => {
  test("maps known Supabase codes to friendly messages", () => {
    const error = toAuthError(
      Object.assign(new Error("Invalid login credentials"), { code: "invalid_credentials" }),
    );
    expect(error).toBeInstanceOf(DevdajAuthError);
    expect(error.message).toBe("Email or password is incorrect.");
    expect(error.code).toBe("invalid_credentials");
  });

  test("keeps the original message for unknown codes", () => {
    expect(toAuthError(Object.assign(new Error("Boom"), { code: "weird" })).message).toBe("Boom");
  });
});

describe("createAuth without config", () => {
  const auth = createAuth({});

  test("reports unconfigured and stays signed out", async () => {
    expect(auth.configured).toBe(false);
    expect(await auth.getAccessToken()).toBeNull();
    expect(auth.onSessionChange(() => {})).toBeTypeOf("function");
  });

  test("actions fail with a clear error", async () => {
    await expect(auth.signInWithPassword("a@b.c", "password1")).rejects.toMatchObject({
      code: "not_configured",
    });
  });

  test("completeOAuth surfaces cancelled sign-ins before touching Supabase", async () => {
    await expect(auth.completeOAuth("fitnexx://auth/callback?error=access_denied")).rejects.toThrow(
      "Sign-in was cancelled.",
    );
  });
});

describe("guest toggle", () => {
  test("guests are off unless the app opts in", async () => {
    const auth = createAuth({ url: "https://p.supabase.co", anonKey: "k" });
    expect(auth.guestEnabled).toBe(false);
    await expect(auth.signInAsGuest()).rejects.toMatchObject({ code: "guest_disabled" });
  });

  test("an app can opt in", () => {
    expect(
      createAuth({ url: "https://p.supabase.co", anonKey: "k", allowGuest: true }).guestEnabled,
    ).toBe(true);
  });

  test("upgrading requires a guest session", async () => {
    const auth = createAuth({
      url: "https://p.supabase.co",
      anonKey: "k",
      allowGuest: true,
      storage: memoryStorage(),
    });
    await expect(auth.upgradeGuestWithEmail("a@b.test")).rejects.toMatchObject({
      code: "not_guest",
    });
    await expect(auth.getGuestLinkUrl("google", "app://cb")).rejects.toMatchObject({
      code: "not_guest",
    });
  });

  test("isGuestUser reads the anonymous flag", () => {
    expect(isGuestUser({ is_anonymous: true })).toBe(true);
    expect(isGuestUser({ is_anonymous: false })).toBe(false);
    expect(isGuestUser(null)).toBe(false);
  });
});

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}
