import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SignInGate } from "../components/SignInGate";
import { api, ApiRequestError, errorMessage } from "../lib/api";
import { useAuth } from "@devdaj/auth/react";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Admin · Apps by DevDAJ" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLayout,
});

/** Mirrors the server's dev bypass (src/server/platform/admin.ts); compiled out of production builds. */
const DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_ADMIN_DEV_BYPASS === "true";

function AdminLayout() {
  return (
    <main className="page">
      {DEV_BYPASS ? (
        <>
          <p className="notice">
            Dev admin bypass is on. Sign-in is skipped in local development only.
          </p>
          <AdminCheck />
        </>
      ) : (
        <SignInGate reason="Sign in with an admin account.">
          <AdminCheck />
        </SignInGate>
      )}
    </main>
  );
}

function AdminCheck() {
  const { user } = useAuth();
  const [state, setState] = useState<string>("checking");
  useEffect(() => {
    api("/admin/me")
      .then(() => setState("ok"))
      .catch((error: unknown) =>
        setState(
          error instanceof ApiRequestError && error.status === 403
            ? "forbidden"
            : errorMessage(error),
        ),
      );
  }, [user?.id]);

  if (state === "checking") return <p className="muted">Checking access…</p>;
  if (state === "forbidden") return <p className="notice">This account is not an admin.</p>;
  if (state !== "ok") return <p className="notice">{state}</p>;
  return (
    <>
      <nav className="tabs">
        <Link to="/admin" activeOptions={{ exact: true }}>
          Downloads &amp; usage
        </Link>
        <Link to="/admin/review">Review queue</Link>
      </nav>
      <Outlet />
    </>
  );
}
