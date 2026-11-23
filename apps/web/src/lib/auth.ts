import { createAuth } from "@devdaj/auth";

/** Shared DevDAJ login (same accounts as the mobile apps). Sessions live in localStorage. */
export const auth = createAuth({
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  detectSessionInUrl: false,
});

/** Web OAuth: leave the page; `/auth/callback` finishes the sign-in. */
export const openAuthUrl = (url: string) => {
  window.location.assign(url);
  return new Promise<string | null>(() => {});
};

export function callbackUrl(): string | undefined {
  return typeof window === "undefined" ? undefined : `${window.location.origin}/auth/callback`;
}
