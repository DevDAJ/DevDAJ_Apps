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
  allowGuest: false,
});

export const isAuthConfigured = auth.configured;
export const supabase = auth.client;

export function requireSupabase() {
  return auth.requireClient();
}
