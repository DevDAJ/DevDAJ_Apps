import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Database,
  KeyRound,
  Lock,
  Smartphone,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { type ComponentType, useState } from "react";
import { APPS, type AppEntry } from "@/catalog";
import { LINE_INK, SERVICE } from "@/components/transit/lines";
import { ServiceBadge } from "@/components/transit/ServiceBadge";
import { TransitMap } from "@/components/transit/TransitMap";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

/** How the network works, as stops along one line. */
const HOW: { title: string; body: string; icon: ComponentType<{ className?: string }> }[] = [
  {
    title: "Your data lives on your phone",
    body: "Each app keeps its own SQLite database in an encrypted shared folder that your other DevDAJ apps can read. Fitnexx already shares workouts, meals, body metrics and water this way, without anything leaving the device.",
    icon: Smartphone,
  },
  {
    title: "Sync will be your choice",
    body: "Planned: the default iOS and Android sync, your own Google Drive, or DevDAJ Sync, encrypted end to end so only your key can decrypt it.",
    icon: Lock,
  },
  {
    title: "AI only if you opt in",
    body: "AI extraction and helpers are off by default. Turn them on for a small free daily allowance with no ads, or subscribe for unlimited use.",
    icon: Sparkles,
  },
  {
    title: "A shared map everyone improves",
    body: "Anyone with an account can add gyms and their equipment to a public map today, and each change is reviewed before it goes live. The apps will read from it next, starting with Fitnexx.",
    icon: Waypoints,
  },
];

const primaryButton =
  "inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-[0.95rem] font-medium text-background no-underline shadow-[var(--shadow-soft)] transition-[opacity,transform] hover:opacity-90 active:translate-y-px";
const secondaryButton =
  "inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-[0.95rem] font-medium text-foreground no-underline transition-colors hover:bg-muted";

function Home() {
  const [active, setActive] = useState<string | null>(null);

  const intro = (
    <>
      <h1 className="max-w-[17ch] text-[clamp(2.4rem,4.4vw,4rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance">
        Private apps that talk to each other on your phone.
      </h1>
      <p className="mt-5 max-w-[44ch] text-lg leading-relaxed text-pretty text-muted-foreground">
        Every app is its own line, and they all meet at one stop: an encrypted folder on your
        device. Ride only the lines you need.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <a href="#apps" className={primaryButton}>
          Explore the apps
          <ArrowRight className="size-4" aria-hidden />
        </a>
        <a href="#how" className={secondaryButton}>
          How it works
        </a>
      </div>
    </>
  );

  return (
    <main>
      {/* Hero: the network map, framed like a product shot, headline in its quiet corner. */}
      <section className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-8 md:pt-10">
        <div className="md:hidden">{intro}</div>
        <div className="dot-grid relative mt-10 overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-[var(--shadow-lift)] md:mt-0">
          <div className="relative hidden px-6 pt-4 pb-2 md:block lg:px-10">
            <TransitMap variant="wide" active={active} onActive={setActive} />
            <div className="absolute top-[7%] left-6 w-[46%] lg:left-10">{intro}</div>
          </div>
          <TransitMap
            variant="tall"
            active={active}
            onActive={setActive}
            className="mx-auto max-w-md px-4 py-6 md:hidden"
          />
          <p className="flex items-center gap-3 border-t border-border bg-card/80 px-6 py-3 text-sm text-muted-foreground backdrop-blur lg:px-10">
            <svg width="40" height="8" aria-hidden className="shrink-0">
              <path
                d="M2 4H38"
                stroke="var(--foreground)"
                strokeOpacity="0.5"
                strokeWidth="4"
                strokeDasharray="7 5"
                strokeLinecap="round"
              />
            </svg>
            Dashed lines are planned. Hover or select a line to follow it.
          </p>
        </div>
      </section>

      {/* The apps: one card per line, each previewing that app's own world. */}
      <section id="apps" className="mx-auto max-w-[80rem] scroll-mt-24 px-4 pt-24 sm:px-8">
        <SectionHeading
          title="Pick your lines"
          lede="Each app works on its own. Install another and it can use what the others already know."
        />
        <ul className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {APPS.map((app) => (
            <li key={app.slug}>
              <AppCard app={app} lit={active === app.slug} onActive={setActive} />
            </li>
          ))}
        </ul>
      </section>

      {/* How it works: four stops on the cobalt line. */}
      <section id="how" className="mx-auto max-w-[80rem] scroll-mt-24 px-4 pt-28 sm:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading
              title="How the network works"
              lede="Privacy you can check: where your data lives, how apps share it, and what is optional."
            />
          </div>
          <ol className="relative flex flex-col gap-4">
            <span
              aria-hidden
              className="absolute top-8 bottom-8 left-[29px] w-1 rounded-full bg-line-cobalt/80"
            />
            {HOW.map(({ title, body, icon: Icon }) => (
              <li
                key={title}
                className="relative grid grid-cols-[3.5rem_1fr] gap-5 rounded-2xl p-1 transition-colors hover:bg-surface"
              >
                <span className="relative z-10 flex size-14 items-center justify-center rounded-full border-4 border-line-cobalt bg-card">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="py-2 pr-2">
                  <span className="block text-lg font-semibold tracking-tight">{title}</span>
                  <span className="mt-1.5 block max-w-[62ch] leading-relaxed text-muted-foreground">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The shared dataset: improve it, or build on it. */}
      <section className="mx-auto max-w-[80rem] px-4 pt-28 sm:px-8">
        <SectionHeading
          title="The blue line is everyone's"
          lede="The global dataset is public information the apps rely on, starting with gyms and their equipment."
        />
        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel
            icon={Database}
            title="Improve the gym map"
            body="Suggest a gym or fix one. A maintainer reviews every change before it goes live, and regular contributors can become maintainers."
            to="/contribute"
            action="Contribute"
          />
          <Panel
            icon={KeyRound}
            title="Build on the dataset"
            body="Free inside DevDAJ apps. Building your own app? Pick a monthly plan and call the API with a token."
            to="/dashboard/api"
            action="See API plans"
          />
        </div>
      </section>

      {/* Close. */}
      <section className="mx-auto max-w-[80rem] px-4 pt-28 pb-28 sm:px-8">
        <div className="relative overflow-hidden rounded-[1.75rem] bg-foreground px-6 py-14 text-background sm:px-12">
          <svg
            viewBox="0 0 600 160"
            className="pointer-events-none absolute right-0 bottom-0 hidden h-full w-auto opacity-90 sm:block"
            aria-hidden
          >
            <path
              d="M600 40H420l-60 60H0"
              fill="none"
              stroke="var(--line-scarlet)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M600 72H452l-28 28"
              fill="none"
              stroke="var(--line-cobalt)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M600 104H440"
              fill="none"
              stroke="var(--line-amber)"
              strokeWidth="10"
              strokeDasharray="18 14"
              strokeLinecap="round"
            />
            <path
              d="M600 136H392l-32-36"
              fill="none"
              stroke="var(--line-green)"
              strokeWidth="10"
              strokeDasharray="18 14"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx="360"
              cy="100"
              r="14"
              fill="var(--foreground)"
              stroke="var(--background)"
              strokeWidth="6"
            />
          </svg>
          <div className="relative max-w-xl">
            <h2 className="text-[clamp(1.8rem,3vw,2.6rem)] leading-tight font-semibold tracking-[-0.035em] text-balance">
              Start with one line. Add the rest when you need them.
            </h2>
            <p className="mt-3 text-background/70">Fitnexx is in trial service on Android today.</p>
            <Link
              to="/apps/$slug"
              params={{ slug: "fitnexx" }}
              className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-background px-5 text-[0.95rem] font-medium text-foreground no-underline transition-opacity hover:opacity-90"
            >
              Get Fitnexx
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function SectionHeading({ title, lede }: { title: string; lede: string }) {
  return (
    <div>
      <h2 className="text-[clamp(1.9rem,3vw,2.6rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
        {title}
      </h2>
      <p className="mt-3 max-w-[52ch] text-lg leading-relaxed text-pretty text-muted-foreground">
        {lede}
      </p>
    </div>
  );
}

/** Each app world's own surface, previewed in its card (see app.css). */
const TEXTURE: Record<string, string> = {
  fitnexx: "grid-plate",
  finance: "ledger-rule",
  pantry: "dot-grid",
};

/** One app as a card whose top half is a window into that app's own themed world. */
function AppCard({
  app,
  lit,
  onActive,
}: {
  app: AppEntry;
  lit: boolean;
  onActive: (id: string | null) => void;
}) {
  const planned = SERVICE[app.status].planned;
  const ink = LINE_INK[app.line];
  return (
    <Link
      to="/apps/$slug"
      params={{ slug: app.slug }}
      onMouseEnter={() => onActive(app.slug)}
      onMouseLeave={() => onActive(null)}
      onFocus={() => onActive(app.slug)}
      onBlur={() => onActive(null)}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground no-underline shadow-[var(--shadow-soft)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]",
        lit && "-translate-y-1 shadow-[var(--shadow-lift)]",
      )}
    >
      <div
        data-app={app.slug}
        className={cn("relative bg-background px-6 pt-6 pb-10 text-foreground", TEXTURE[app.slug])}
      >
        {app.slug === "pantry" && (
          <span aria-hidden className="gingham absolute inset-x-0 top-0 h-2.5" />
        )}
        <div className="flex items-start justify-between gap-3">
          <span className="font-display text-[2rem] leading-none font-semibold tracking-tight">
            {app.name}
          </span>
          <ServiceBadge status={app.status} />
        </div>
        {/* The line and its stops. */}
        <div className="relative mt-10 h-12">
          <span
            aria-hidden
            className="absolute inset-x-3 top-2.5 h-2 rounded-full"
            style={{
              background: planned
                ? `repeating-linear-gradient(90deg, ${ink} 0 16px, transparent 16px 28px)`
                : ink,
            }}
          />
          <ul className="absolute inset-x-0 top-0 flex justify-between">
            {app.stops.map((stop) => (
              <li key={stop} className="flex flex-col items-center gap-2">
                <span
                  className="size-7 rounded-full border-[5px] bg-background"
                  style={{ borderColor: ink }}
                />
                <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                  {stop}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="leading-relaxed text-muted-foreground">{app.tagline}</p>
        <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium">
          {planned ? "See what's planned" : "View app"}
          <ArrowRight
            className="size-4 transition-transform duration-300 group-hover:translate-x-1"
            aria-hidden
          />
        </span>
      </div>
    </Link>
  );
}

function Panel({
  icon: Icon,
  title,
  body,
  to,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
  to: "/contribute" | "/dashboard/api";
  action: string;
}) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-7 text-foreground no-underline shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-lift)]"
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-line-cobalt" />
      <span className="flex size-11 items-center justify-center rounded-xl bg-line-cobalt/10 text-line-cobalt">
        <Icon className="size-5" />
      </span>
      <span className="text-xl font-semibold tracking-tight">{title}</span>
      <span className="max-w-[52ch] leading-relaxed text-muted-foreground">{body}</span>
      <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium">
        {action}
        <ArrowRight
          className="size-4 transition-transform duration-300 group-hover:translate-x-1"
          aria-hidden
        />
      </span>
    </Link>
  );
}
