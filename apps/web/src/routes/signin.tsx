import { useAuth } from "@devdaj/auth/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { errorMessage } from "../lib/api";

export const Route = createFileRoute("/signin")({
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    const next =
      typeof search.next === "string" && search.next.startsWith("/") ? search.next : undefined;
    return next ? { next } : {};
  },
  head: () => ({ meta: [{ title: "Sign in · Apps by DevDAJ" }] }),
  component: SignIn,
});

function SignIn() {
  const { next = "/" } = Route.useSearch();
  const navigate = useNavigate();
  const { configured, user, isGuest, signIn, signUp, signInWithOAuth } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && !isGuest) void navigate({ to: next });
  }, [user, isGuest, next, navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "in") await signIn(email, password);
      else if (await signUp(email, password))
        setMessage("Check your email to confirm your account.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const social = async (provider: "google" | "apple") => {
    try {
      sessionStorage.setItem("devdaj.next", next);
      await signInWithOAuth(provider);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  if (!configured)
    return (
      <main className="page narrow">
        <p className="notice">Sign-in is not configured on this server.</p>
      </main>
    );

  return (
    <main className="page narrow">
      <h1>{mode === "in" ? "Sign in" : "Create an account"}</h1>
      <p className="muted">One DevDAJ account works in every app.</p>
      <form className="form" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {message && <p className="notice">{message}</p>}
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
        <button type="button" className="button ghost" onClick={() => void social("google")}>
          Continue with Google
        </button>
        <button type="button" className="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}
