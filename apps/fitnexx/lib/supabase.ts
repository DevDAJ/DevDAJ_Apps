import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAuth } from "@devdaj/auth";
import { processLock } from "@supabase/supabase-js";

/** Shared DevDAJ login (one account across every DevDAJ app), backed by the shared Supabase project. */
export const auth = createAuth({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  storage: AsyncStorage,
  lock: processLock,
  // Toggle guest access for this app (also needs FITNEXX_ALLOW_GUESTS on the API).
  allowGuest: process.env.EXPO_PUBLIC_AUTH_ALLOW_GUEST === "true",
});

export const isAuthConfigured = auth.configured;
export const supabase = auth.client;

export function requireSupabase() {
  return auth.requireClient();
}

const PENDING_PASSWORD_KEY = "fitnexx_auth_pending_password";

/** A guest started upgrading by email; once the link brings them back, ask for a password. */
export const pendingPassword = {
  mark: () => AsyncStorage.setItem(PENDING_PASSWORD_KEY, "1"),
  isSet: async () => (await AsyncStorage.getItem(PENDING_PASSWORD_KEY)) === "1",
  clear: () => AsyncStorage.removeItem(PENDING_PASSWORD_KEY),
};
