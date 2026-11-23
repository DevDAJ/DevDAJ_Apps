import { useAuth } from "@devdaj/auth/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Renders children only for a signed-in full account. */
export function SignInGate({ reason, children }: { reason: string; children: ReactNode }) {
  const { configured, loading, user, isGuest } = useAuth();
  if (!configured) return <p className="notice">Sign-in is not configured on this server.</p>;
  if (loading) return <p className="muted">Loading…</p>;
  if (!user || isGuest) {
    return (
      <div className="notice">
        <p>{reason}</p>
        <Link
          className="button"
          to="/signin"
          search={{ next: typeof window === "undefined" ? "/" : window.location.pathname }}
        >
          Sign in
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
