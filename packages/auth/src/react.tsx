import type { Session, User } from "@supabase/supabase-js";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { type DevdajAuth, DevdajAuthError, isGuestUser, type OAuthProvider } from "./index";

/**
 * Opens the provider URL and resolves with the URL it redirected back to,
 * or `null` if the user cancelled. Platform-specific (expo-web-browser, window, ...).
 */
export type OpenAuthUrl = (url: string, redirectTo: string) => Promise<string | null>;

export interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Resolves `true` when the user must confirm their email before signing in. */
  signUp: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  /** Resolves `false` if the user closed the browser without finishing. */
  signInWithOAuth: (provider: OAuthProvider) => Promise<boolean>;

  /** This app allows guests (`createAuth({ allowGuest: true })`). Use it to show/hide the guest option. */
  guestEnabled: boolean;
  /** The current session is a guest (anonymous) user. */
  isGuest: boolean;
  signInAsGuest: () => Promise<void>;
  /** Guest → full account, step 1: sends a confirmation email. Afterwards call `updatePassword`. */
  upgradeGuestWithEmail: (email: string) => Promise<void>;
  /** Guest → full account via Google/Apple, keeping the guest's data. `false` if cancelled. */
  linkGuestWithOAuth: (provider: OAuthProvider) => Promise<boolean>;
  updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  auth: DevdajAuth;
  children: ReactNode;
  /** Where Supabase sends the user back to, e.g. `myapp://auth/callback`. Must be allow-listed in Supabase. */
  redirectTo?: string;
  /** Needed for `signInWithOAuth`. */
  openAuthUrl?: OpenAuthUrl;
}

export function AuthProvider({ auth, children, redirectTo, openAuthUrl }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(auth.configured);

  useEffect(() => {
    if (!auth.configured) return;
    let active = true;
    void auth.getSession().then((current) => {
      if (!active) return;
      setSession(current);
      setLoading(false);
    });
    const unsubscribe = auth.onSessionChange((next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth]);

  const value = useMemo<AuthContextValue>(() => {
    const runOAuth = async (getUrl: (redirect: string) => Promise<string>) => {
      if (!openAuthUrl || !redirectTo) {
        throw new DevdajAuthError("Social sign-in is not set up for this app.", "not_configured");
      }
      const callbackUrl = await openAuthUrl(await getUrl(redirectTo), redirectTo);
      if (!callbackUrl) return false;
      await auth.completeOAuth(callbackUrl);
      return true;
    };
    return {
      configured: auth.configured,
      loading,
      session,
      user: session?.user ?? null,
      signIn: async (email, password) => {
        await auth.signInWithPassword(email, password);
      },
      signUp: async (email, password) =>
        (await auth.signUp(email, password, { redirectTo })).needsConfirmation,
      signOut: () => auth.signOut(),
      sendPasswordReset: (email) => auth.sendPasswordReset(email, redirectTo),
      signInWithOAuth: (provider) => runOAuth((redirect) => auth.getOAuthUrl(provider, redirect)),
      guestEnabled: auth.guestEnabled,
      isGuest: isGuestUser(session?.user),
      signInAsGuest: async () => {
        await auth.signInAsGuest();
      },
      upgradeGuestWithEmail: (email) => auth.upgradeGuestWithEmail(email, redirectTo),
      linkGuestWithOAuth: (provider) =>
        runOAuth((redirect) => auth.getGuestLinkUrl(provider, redirect)),
      updatePassword: (password) => auth.updatePassword(password),
    };
  }, [auth, loading, session, redirectTo, openAuthUrl]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>.");
  return value;
}
