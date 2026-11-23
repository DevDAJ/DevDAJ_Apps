import { AuthProvider as DevdajAuthProvider, type OpenAuthUrl } from "@devdaj/auth/react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import type { ReactNode } from "react";

import { auth } from "../../lib/supabase";

export { useAuth } from "@devdaj/auth/react";

// Closes the auth popup when OAuth finishes on web; no-op on native.
WebBrowser.maybeCompleteAuthSession();

/**
 * `fitnexx://auth-callback` in builds (an exp:// URL in Expo Go). Allow-list it in Supabase Auth.
 * OAuth returns here inside the auth browser; email links open `app/auth-callback.tsx`.
 */
export const redirectTo = Linking.createURL("auth-callback");

const openAuthUrl: OpenAuthUrl = async (url, returnUrl) => {
  const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
  return result.type === "success" ? result.url : null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <DevdajAuthProvider auth={auth} openAuthUrl={openAuthUrl} redirectTo={redirectTo}>
      {children}
    </DevdajAuthProvider>
  );
}
