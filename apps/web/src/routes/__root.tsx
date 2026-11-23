import { AuthProvider, useAuth } from "@devdaj/auth/react";
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { auth, callbackUrl, openAuthUrl } from "../lib/auth";
import appCss from "../app.css?url";
import { APPS, findApp } from "../catalog";
import { LINE_INK } from "../components/transit/lines";
import { Wordmark } from "../components/transit/Wordmark";
import legacyCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Apps by DevDAJ" },
      {
        name: "description",
        content: "Small, private apps: your data stays on your phone. Fitness, finance and pantry.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: legacyCss },
    ],
  }),
  component: Root,
  notFoundComponent: () => (
    <main className="page narrow">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to the apps</Link>
      </p>
    </main>
  ),
});

function Root() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider auth={auth} redirectTo={callbackUrl()} openAuthUrl={openAuthUrl}>
          <Shell>
            <Outlet />
          </Shell>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}

/** The app page being shown, if any: its slug picks the page's theme ([data-app] in app.css). */
function useAppTheme(): string | undefined {
  return useRouterState({
    select: (state) => {
      const match = state.matches.find((m) => m.routeId === "/apps/$slug");
      const slug = (match?.params as { slug?: string } | undefined)?.slug;
      return slug && findApp(slug) ? slug : undefined;
    },
  });
}

const NAV_LINK =
  "rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground data-[status=active]:text-foreground";

function Shell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const theme = useAppTheme();
  const links = (
    <>
      <Link
        to="/"
        hash="apps"
        activeOptions={{ exact: true, includeHash: true }}
        className={NAV_LINK}
      >
        Apps
      </Link>
      <Link to="/dashboard/api" className={NAV_LINK}>
        Developers
      </Link>
      <Link to="/contribute" className={NAV_LINK}>
        Contribute
      </Link>
      <Link to="/dashboard" activeOptions={{ exact: false }} className={NAV_LINK}>
        Dashboard
      </Link>
    </>
  );
  return (
    <div data-app={theme} className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/75 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-[80rem] items-center gap-6 px-4 sm:px-8">
          <Link to="/" className="text-foreground no-underline" aria-label="Apps by DevDAJ, home">
            <Wordmark />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-0.5 md:flex">
            {links}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <button
                type="button"
                onClick={() => void signOut()}
                className="h-9 cursor-pointer rounded-full px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Sign out
              </button>
            ) : (
              <Link
                to="/signin"
                className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background no-underline transition-opacity hover:opacity-90"
              >
                Sign in
              </Link>
            )}
            <details className="group relative md:hidden">
              <summary
                aria-label="Menu"
                className="flex size-9 cursor-pointer list-none items-center justify-center rounded-full border border-border hover:bg-muted [&::-webkit-details-marker]:hidden"
              >
                <Menu className="size-4 group-open:hidden" aria-hidden />
                <X className="hidden size-4 group-open:block" aria-hidden />
              </summary>
              <nav
                aria-label="Main"
                className="absolute top-11 right-0 flex w-52 flex-col gap-0.5 rounded-xl border border-border bg-popover p-1.5 shadow-[var(--shadow-lift)] [&>a]:rounded-lg"
              >
                {links}
              </nav>
            </details>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border bg-surface/60">
        <div className="mx-auto grid max-w-[80rem] gap-10 px-4 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-sm">
            <Wordmark />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Small, private apps by one maker. Each app is its own line; they meet only in an
              encrypted folder on your phone.
            </p>
          </div>
          <FooterColumn title="Apps">
            {APPS.map((app) => (
              <Link
                key={app.slug}
                to="/apps/$slug"
                params={{ slug: app.slug }}
                className="group inline-flex items-center gap-2"
              >
                <span
                  aria-hidden
                  className="h-1 w-4 rounded-full"
                  style={{ background: LINE_INK[app.line] }}
                />
                {app.name}
              </Link>
            ))}
          </FooterColumn>
          <FooterColumn title="Platform">
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/dashboard/dataset">Public dataset</Link>
            <Link to="/dashboard/api">Developer API</Link>
            <Link to="/contribute">Contribute</Link>
            <Link to="/admin">Admin</Link>
          </FooterColumn>
        </div>
        <div className="border-t border-border">
          <p className="mx-auto max-w-[80rem] px-4 py-5 text-xs text-muted-foreground sm:px-8">
            DevDAJ. Your data stays on your phone unless you choose otherwise.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground [&>a]:no-underline [&>a]:transition-colors [&>a:hover]:text-foreground">
        {children}
      </div>
    </div>
  );
}
