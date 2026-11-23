# @devdaj/auth

Headless (no UI) login shared by every DevDAJ app. One Supabase project holds every account, so a
user signs in once with the same email, Google or Apple identity in every app. Each app builds its
own screens on top of this package.

- `@devdaj/auth`: framework-agnostic core (`createAuth`), with email + password, password reset,
  Google/Apple OAuth (PKCE) and the access token for the API in `apps/web`.
- `@devdaj/auth/react`: `<AuthProvider>` + `useAuth()` for React and React Native.

## Use in an app

```ts
// lib/auth.ts
import { createAuth } from "@devdaj/auth";
export const auth = createAuth({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL, // shared DevDAJ project
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  storage: AsyncStorage, // React Native; omit on web (localStorage)
  lock: processLock, // React Native
});
```

```tsx
<AuthProvider auth={auth} redirectTo="myapp://auth/callback" openAuthUrl={openAuthUrl}>
  <App />
</AuthProvider>;

const { user, signIn, signUp, signOut, sendPasswordReset, signInWithOAuth } = useAuth();
```

`openAuthUrl(url, redirectTo)` opens the provider page and resolves with the URL the browser came
back to, or `null` if the user cancelled. In Expo that's `WebBrowser.openAuthSessionAsync`; see
`apps/fitnexx/components/auth/AuthProvider.tsx`.

Call the API with `Authorization: Bearer ${await auth.getAccessToken()}`. On the server,
`apps/web/src/server/shared/auth.ts` verifies the token (`auth: "<401 message>"` route option).

## Guest access (per app toggle)

Off by default. An app turns it on with `createAuth({ allowGuest: true })` (Fitnexx reads
`EXPO_PUBLIC_AUTH_ALLOW_GUEST`). Guests are Supabase anonymous users with a real user id, so the server
can store their data.

- `useAuth()` provides `guestEnabled` (whether to show a "Continue as guest" option), `isGuest` and `signInAsGuest()`.
- Upgrading keeps the same user id and all data:
  - `linkGuestWithOAuth("google" | "apple")` is a single step.
  - `upgradeGuestWithEmail(email)` sends a confirmation link. After the link opens the app, call
    `updatePassword()`, because Supabase only allows a guest's password once the email is verified.
- `signIn` from a guest session switches to that account; the guest's server data is left behind.
- The client toggle only hides the UI. The API enforces guest access: guests get
  `403 { code: "account_required" }` unless the route allows them (`auth: { message, guests: true }`).

Errors are `DevdajAuthError` with a user-safe `message` and the Supabase `code`.

## Supabase setup (once, for the shared project)

1. **Auth → Providers**: enable Email, Google and Apple. Google needs a Web OAuth client ID and
   secret; Apple needs a Services ID, key ID, team ID and private key.
2. **Auth → URL Configuration → Redirect URLs**: add every app's callback, e.g.
   `fitnexx://auth-callback` (plus `exp://**` while developing in Expo Go).
3. Prefer **asymmetric JWT signing keys** (Settings → JWT Keys) so the API verifies tokens locally.
4. For guests: **Auth → Providers → Allow anonymous sign-ins**, and **Allow manual linking** (needed for
   upgrades). Strongly recommended: turn on CAPTCHA/Turnstile (pass `captchaToken` to
   `signInAsGuest`), because each guest is a database user and the default limit is 30 per hour per IP.
   Delete stale guests periodically, since Supabase doesn't clean them up automatically.
