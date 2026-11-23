/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** "true" skips admin sign-in under `vp dev` only. */
  readonly VITE_ADMIN_DEV_BYPASS?: string;
}
