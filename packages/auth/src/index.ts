import {
  createClient,
  type LockFunc,
  type Session,
  type SupabaseClient,
  type SupportedStorage,
} from "@supabase/supabase-js";

export type { Session, SupabaseClient, User } from "@supabase/supabase-js";

/** Social providers enabled for DevDAJ accounts. */
export type OAuthProvider = "google" | "apple";

export interface AuthConfig {
  /** Shared DevDAJ Supabase project URL. Missing values leave auth "unconfigured" instead of throwing. */
  url?: string;
  /** Publishable (anon) key of the shared project. */
  anonKey?: string;
  /** Where the session lives: AsyncStorage on React Native, omit for localStorage on web. */
  storage?: SupportedStorage;
  /** Web: let Supabase pick the session out of the URL after a redirect. Native: leave false. */
  detectSessionInUrl?: boolean;
  /** React Native: pass `processLock` from supabase-js. */
  lock?: LockFunc;
  /**
   * Let people use the app as a guest (a Supabase anonymous user) and upgrade to a full account later
   * without losing data. Off by default; enable per app. Also needs "Allow anonymous sign-ins" in Supabase,
   * and the API must allow guests on the routes they may use (`guests: true`).
   */
  allowGuest?: boolean;
}

/** True for a Supabase anonymous (guest) user. */
export function isGuestUser(user: { is_anonymous?: boolean } | null | undefined): boolean {
  return user?.is_anonymous === true;
}

export interface DevdajAuth {
  readonly configured: boolean;
  /** The underlying client, for app data queries against the shared project. */
  readonly client: SupabaseClient | null;
  requireClient(): SupabaseClient;
  getSession(): Promise<Session | null>;
  /** Bearer token for calls to the DevDAJ API (`apps/web`, `/api/*`). */
  getAccessToken(): Promise<string | null>;
  onSessionChange(listener: (session: Session | null) => void): () => void;
  signInWithPassword(email: string, password: string): Promise<Session>;
  /** Resolves `needsConfirmation: true` when the project requires email confirmation first. */
  signUp(
    email: string,
    password: string,
    options?: { redirectTo?: string },
  ): Promise<{ needsConfirmation: boolean }>;
  sendPasswordReset(email: string, redirectTo?: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Step 1 of OAuth (PKCE): the provider URL to open in a browser. */
  getOAuthUrl(provider: OAuthProvider, redirectTo: string): Promise<string>;
  /** Step 2 of OAuth (PKCE): finish with the URL the browser redirected back to. */
  completeOAuth(callbackUrl: string): Promise<Session>;

  /** Whether this app was created with `allowGuest: true`. */
  readonly guestEnabled: boolean;
  /** Starts a guest session. Throws `guest_disabled` unless `allowGuest` is on. */
  signInAsGuest(options?: { captchaToken?: string }): Promise<Session>;
  /**
   * Step 1 of turning the current guest into a full account, keeping the same user id (so all
   * server-side data). Supabase emails a confirmation link; once the user has confirmed it, call
   * `updatePassword` to finish. Requires "manual linking" in Supabase Auth.
   */
  upgradeGuestWithEmail(email: string, redirectTo?: string): Promise<void>;
  /** Like `getOAuthUrl`, but links Google/Apple to the current guest instead of signing in fresh. */
  getGuestLinkUrl(provider: OAuthProvider, redirectTo: string): Promise<string>;
}

export class DevdajAuthError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "DevdajAuthError";
  }
}

const FRIENDLY: Record<string, string> = {
  invalid_credentials: "Email or password is incorrect.",
  email_not_confirmed: "Confirm your email address before signing in.",
  user_already_exists: "An account with this email already exists. Sign in instead.",
  weak_password: "Choose a stronger password (at least 8 characters).",
  over_request_rate_limit: "Too many attempts. Wait a minute and try again.",
  over_email_send_rate_limit: "Too many emails sent. Wait a minute and try again.",
  access_denied: "Sign-in was cancelled.",
  anonymous_provider_disabled: "Guest access is turned off. Sign in or create an account.",
  identity_already_exists: "That account already exists. Sign in to it instead.",
  email_exists: "An account with this email already exists. Sign in instead.",
};

/** Maps Supabase auth errors (by `code`) to messages safe to show users. */
export function toAuthError(error: unknown, fallback = "Authentication failed."): DevdajAuthError {
  if (error instanceof DevdajAuthError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error && error.message ? error.message : fallback;
  if (typeof code === "string") return new DevdajAuthError(FRIENDLY[code] ?? message, code);
  return new DevdajAuthError(message);
}

/** Reads `code` or an OAuth error from a redirect URL (query string or hash fragment). */
export function parseAuthCallback(
  url: string,
): { code: string } | { error: string; description?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "invalid_callback" };
  }
  const params = new URLSearchParams(parsed.search);
  for (const [key, value] of new URLSearchParams(parsed.hash.replace(/^#/, ""))) {
    if (!params.has(key)) params.set(key, value);
  }
  const error = params.get("error_code") ?? params.get("error");
  if (error) return { error, description: params.get("error_description") ?? undefined };
  const code = params.get("code");
  return code ? { code } : { error: "missing_code" };
}

export function createAuth(config: AuthConfig): DevdajAuth {
  const client =
    config.url && config.anonKey
      ? createClient(config.url, config.anonKey, {
          auth: {
            flowType: "pkce",
            storage: config.storage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: config.detectSessionInUrl ?? false,
            lock: config.lock,
          },
        })
      : null;

  const requireClient = () => {
    if (!client)
      throw new DevdajAuthError("Sign-in is not configured for this app.", "not_configured");
    return client;
  };

  const guestEnabled = config.allowGuest === true;

  /** The client, when the current session is a guest (for upgrade flows). */
  const requireGuest = async () => {
    const current = requireClient();
    const { data } = await current.auth.getSession();
    if (!isGuestUser(data.session?.user)) {
      throw new DevdajAuthError("Only a guest session can be upgraded.", "not_guest");
    }
    return current;
  };

  return {
    configured: client !== null,
    client,
    requireClient,
    guestEnabled,

    async signInAsGuest(options) {
      if (!guestEnabled) {
        throw new DevdajAuthError(
          "Guest access isn't available in this app. Sign in or create an account.",
          "guest_disabled",
        );
      }
      const { data, error } = await requireClient().auth.signInAnonymously({
        options: { captchaToken: options?.captchaToken },
      });
      if (error || !data.session) throw toAuthError(error, "Could not start a guest session.");
      return data.session;
    },

    async upgradeGuestWithEmail(email, redirectTo) {
      // Supabase only allows a password once the email is verified, so that's a second step.
      const guest = await requireGuest();
      const { error } = await guest.auth.updateUser({ email }, { emailRedirectTo: redirectTo });
      if (error) throw toAuthError(error);
    },

    async getGuestLinkUrl(provider, redirectTo) {
      const guest = await requireGuest();
      const { data, error } = await guest.auth.linkIdentity({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) throw toAuthError(error, "Could not start account linking.");
      return data.url;
    },

    async getSession() {
      if (!client) return null;
      const { data } = await client.auth.getSession();
      return data.session;
    },

    async getAccessToken() {
      return (await this.getSession())?.access_token ?? null;
    },

    onSessionChange(listener) {
      if (!client) return () => {};
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(session));
      return () => data.subscription.unsubscribe();
    },

    async signInWithPassword(email, password) {
      const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
      if (error) throw toAuthError(error);
      return data.session;
    },

    async signUp(email, password, options) {
      const { data, error } = await requireClient().auth.signUp({
        email,
        password,
        options: { emailRedirectTo: options?.redirectTo },
      });
      if (error) throw toAuthError(error);
      return { needsConfirmation: !data.session };
    },

    async sendPasswordReset(email, redirectTo) {
      const { error } = await requireClient().auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw toAuthError(error);
    },

    async updatePassword(password) {
      const { error } = await requireClient().auth.updateUser({ password });
      if (error) throw toAuthError(error);
    },

    async signOut() {
      const { error } = await requireClient().auth.signOut();
      if (error) throw toAuthError(error);
    },

    async getOAuthUrl(provider, redirectTo) {
      const { data, error } = await requireClient().auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) throw toAuthError(error, "Could not start sign-in.");
      return data.url;
    },

    async completeOAuth(callbackUrl) {
      const result = parseAuthCallback(callbackUrl);
      if ("error" in result) {
        throw new DevdajAuthError(
          FRIENDLY[result.error] ?? result.description ?? "Sign-in failed.",
          result.error,
        );
      }
      const { data, error } = await requireClient().auth.exchangeCodeForSession(result.code);
      if (error) throw toAuthError(error);
      return data.session;
    },
  };
}
