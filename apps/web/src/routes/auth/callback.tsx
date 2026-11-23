import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { errorMessage } from "../../lib/api";
import { auth } from "../../lib/auth";

export const Route = createFileRoute("/auth/callback")({ ssr: false, component: Callback });

function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    auth
      .completeOAuth(window.location.href)
      .then(() => {
        const next = sessionStorage.getItem("devdaj.next") ?? "/";
        sessionStorage.removeItem("devdaj.next");
        void navigate({ to: next.startsWith("/") ? next : "/", replace: true });
      })
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [navigate]);
  return (
    <main className="page narrow">
      {error ? <p className="notice">{error}</p> : <p className="muted">Signing you in…</p>}
    </main>
  );
}
