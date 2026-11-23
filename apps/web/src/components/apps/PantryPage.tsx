import { Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import type { AppEntry } from "@/catalog";
import { SERVICE } from "@/components/transit/lines";
import { cn } from "@/lib/utils";
import { BackLink, otherApps, PartnerName, StoreButtons } from "./shared";

/*
 * Pantry Helper: a home kitchen. Cream counter, tomato and basil, gingham cloth, a recipe card
 * and jars on a shelf. Chunky rounded type, buttons that press down like a hob knob.
 */

const pressable =
  "inline-flex h-12 items-center gap-2 rounded-full px-6 text-base font-bold no-underline transition-[transform,box-shadow] active:translate-y-[3px]";

/** The four jar colours on the shelf, in order. */
const JARS = ["var(--tomato)", "var(--basil)", "var(--butter)", "oklch(0.7 0.1 60)"];

export function PantryPage({ app }: { app: AppEntry }) {
  const planned = SERVICE[app.status].planned;
  return (
    <main>
      {/* Tablecloth edge under the header. */}
      <div aria-hidden className="gingham h-4 border-b border-border" />

      <section className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-8">
        <BackLink />
        <div className="mt-8 grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <span className="inline-flex -rotate-3 items-center gap-2 rounded-full bg-[var(--butter)] px-4 py-1.5 text-sm font-bold text-foreground shadow-[var(--shadow-soft)]">
              {planned ? "Still in the oven" : SERVICE[app.status].label}
            </span>
            <h1 className="mt-6 font-display text-[clamp(3.6rem,8.5vw,6.5rem)] leading-[0.92] font-extrabold tracking-[-0.03em]">
              {app.name}
            </h1>
            <svg viewBox="0 0 260 18" className="mt-3 h-4 w-56 text-brand" aria-hidden>
              <path
                d="M3 12c20-10 40-10 60 0s40 10 60 0 40-10 60 0 40 10 60 0"
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
            <p className="mt-6 max-w-[30ch] font-display text-[1.75rem] leading-[1.15] font-semibold">
              {app.tagline}
            </p>
            <p className="mt-4 max-w-[48ch] text-lg leading-relaxed text-muted-foreground">
              {app.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <StoreButtons
                app={app}
                buttonClass={cn(
                  pressable,
                  "bg-brand text-brand-foreground shadow-[0_4px_0_oklch(0.45_0.17_33)] active:shadow-[0_1px_0_oklch(0.45_0.17_33)]",
                )}
                emptyClass="inline-flex h-12 items-center rounded-full border-2 border-dashed border-foreground/25 px-6 text-base font-semibold text-muted-foreground"
              />
              <a
                href="#pairs"
                className={cn(
                  pressable,
                  "border-2 border-[var(--basil)] bg-card text-[var(--basil)] shadow-[0_4px_0_var(--basil)] active:shadow-[0_1px_0_var(--basil)]",
                )}
              >
                What it pairs with
              </a>
            </div>
          </div>
          <Shelf stops={app.stops} />
        </div>
      </section>

      {/* The recipe card: ingredients are what it keeps track of, method is what it does. */}
      <section className="mx-auto max-w-[80rem] px-4 pt-28 sm:px-8">
        <h2 className="font-display text-[clamp(2.2rem,4vw,3.25rem)] leading-none font-extrabold tracking-tight">
          What's cooking
        </h2>
        <div className="relative mt-10 rotate-[-0.6deg] overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[var(--shadow-lift)]">
          <div aria-hidden className="gingham h-3" />
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,18rem)_1fr]">
            <div className="border-b border-dashed border-border p-7 md:border-r md:border-b-0">
              <h3 className="font-display text-2xl font-bold">Keeps track of</h3>
              <ul className="mt-5 flex flex-col gap-3">
                {app.stops.map((stop, i) => (
                  <li key={stop} className="flex items-center gap-3 text-lg font-medium">
                    <span
                      className="flex size-7 items-center justify-center rounded-lg text-brand-foreground"
                      style={{ background: JARS[i % JARS.length] }}
                    >
                      <Check className="size-4" strokeWidth={3} aria-hidden />
                    </span>
                    {stop}
                  </li>
                ))}
              </ul>
            </div>
            <div
              className="p-7"
              style={{
                backgroundImage:
                  "linear-gradient(transparent calc(2.25rem - 1px), oklch(0.62 0.19 33 / 12%) calc(2.25rem - 1px))",
                backgroundSize: "100% 2.25rem",
              }}
            >
              <h3 className="font-display text-2xl font-bold">Method</h3>
              <ol className="mt-5 flex flex-col gap-5">
                {app.highlights.map((step, i) => (
                  <li key={step} className="flex items-start gap-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand font-display text-lg font-extrabold text-brand-foreground">
                      {i + 1}
                    </span>
                    <span className="pt-1 text-xl leading-snug font-semibold">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Pairs well with: the other apps it shares with. */}
      <section id="pairs" className="mx-auto max-w-[80rem] scroll-mt-24 px-4 pt-28 sm:px-8">
        <h2 className="font-display text-[clamp(2.2rem,4vw,3.25rem)] leading-none font-extrabold tracking-tight">
          Pairs well with
        </h2>
        <p className="mt-3 max-w-[54ch] text-lg text-muted-foreground">
          Shared through an encrypted folder on your phone, never through a server.
        </p>
        <ul className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2">
          {app.transfers.map((t) => (
            <li
              key={`${t.with}-${t.carries}`}
              className="flex items-center gap-5 rounded-[2rem] border border-border bg-card p-6 shadow-[var(--shadow-soft)]"
            >
              <Plate />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-2xl font-bold">
                  <PartnerName transfer={t} />
                </span>
                <span className="mt-1 block text-muted-foreground">{t.carries}</span>
              </span>
              <span
                className={cn(
                  "shrink-0 rotate-3 rounded-full px-3 py-1 text-xs font-bold",
                  t.status === "planned"
                    ? "bg-[var(--butter)] text-foreground"
                    : "bg-[var(--basil)] text-brand-foreground",
                )}
              >
                {t.status === "planned" ? "Planned" : "Working now"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Other apps. */}
      <section className="mx-auto max-w-[80rem] px-4 pt-28 pb-28 sm:px-8">
        <h2 className="font-display text-[clamp(2.2rem,4vw,3.25rem)] leading-none font-extrabold tracking-tight">
          More from the kitchen
        </h2>
        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {otherApps(app).map((other, i) => (
            <li key={other.slug}>
              <Link
                to="/apps/$slug"
                params={{ slug: other.slug }}
                className={cn(
                  "group flex items-center justify-between gap-4 rounded-[var(--radius)] border border-border bg-card p-6 text-foreground no-underline shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-1 hover:rotate-0",
                  i % 2 ? "rotate-[0.8deg]" : "rotate-[-0.8deg]",
                )}
              >
                <span>
                  <span className="block font-display text-2xl font-extrabold">{other.name}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{other.tagline}</span>
                </span>
                <ArrowRight
                  className="size-5 shrink-0 transition-transform group-hover:translate-x-1"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

/** A shelf of jars, one per thing it tracks, with a pot steaming beside them. */
function Shelf({ stops }: { stops: string[] }) {
  return (
    <figure className="relative m-0 overflow-hidden rounded-[2rem] border border-border bg-card shadow-[var(--shadow-lift)]">
      <svg
        viewBox="0 0 480 360"
        className="block h-auto w-full"
        role="img"
        aria-label={`A kitchen shelf with jars labelled ${stops.join(" and ")}, and a pot on the hob`}
      >
        <rect width="480" height="360" fill="var(--surface)" />
        {/* Wall tiles. */}
        <g stroke="var(--border)" strokeWidth="2">
          {[60, 120, 180].map((y) => (
            <line key={y} x1="0" y1={y} x2="480" y2={y} />
          ))}
          {[80, 160, 240, 320, 400].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="230" />
          ))}
        </g>
        {/* Shelf. */}
        <rect x="24" y="150" width="250" height="14" rx="7" fill="oklch(0.62 0.08 60)" />
        {stops.map((stop, i) => {
          const x = 40 + i * 118;
          const color = JARS[i % JARS.length];
          return (
            <g key={stop}>
              <rect x={x + 18} y="54" width="64" height="14" rx="5" fill="oklch(0.45 0.06 50)" />
              <rect x={x + 6} y="66" width="88" height="84" rx="20" fill={color} opacity="0.9" />
              <rect x={x + 10} y="92" width="80" height="30" rx="8" fill="var(--card)" />
              <text
                x={x + 50}
                y="112"
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="var(--foreground)"
                style={{ fontFamily: "var(--display-face)" }}
              >
                {stop.length > 14 ? `${stop.slice(0, 13)}…` : stop}
              </text>
            </g>
          );
        })}
        {/* Counter and hob. */}
        <rect x="0" y="230" width="480" height="130" fill="oklch(0.86 0.05 70)" />
        <rect x="0" y="230" width="480" height="10" fill="oklch(0.78 0.06 65)" />
        <ellipse cx="370" cy="248" rx="70" ry="9" fill="oklch(0.3 0.02 40)" opacity="0.5" />
        {/* Pot. */}
        <rect x="300" y="168" width="140" height="78" rx="18" fill="var(--tomato)" />
        <rect x="290" y="160" width="160" height="16" rx="8" fill="oklch(0.5 0.17 33)" />
        <rect x="270" y="180" width="30" height="12" rx="6" fill="oklch(0.5 0.17 33)" />
        <rect x="440" y="180" width="30" height="12" rx="6" fill="oklch(0.5 0.17 33)" />
        <circle cx="370" cy="207" r="14" fill="var(--butter)" />
        {/* Steam. */}
        {[340, 370, 400].map((x, i) => (
          <path
            key={x}
            className="steam"
            style={{ animationDelay: `${i * 0.7}s` }}
            d={`M${x} 150c-10-12 10-20 0-34s10-22 0-32`}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeOpacity="0.55"
            strokeWidth="5"
            strokeLinecap="round"
          />
        ))}
        {/* Herb pot. */}
        <rect x="60" y="270" width="64" height="56" rx="12" fill="oklch(0.62 0.1 45)" />
        <circle cx="76" cy="262" r="16" fill="var(--basil)" />
        <circle cx="96" cy="252" r="18" fill="var(--basil)" />
        <circle cx="114" cy="264" r="15" fill="oklch(0.6 0.13 150)" />
      </svg>
      <figcaption className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
        Illustration, not a screenshot: the app isn't out yet.
      </figcaption>
    </figure>
  );
}

/** A little plate with a fork and knife: what a pairing is served on. */
function Plate() {
  return (
    <svg viewBox="0 0 64 64" className="size-14 shrink-0" aria-hidden>
      <rect
        x="4"
        y="12"
        width="4"
        height="40"
        rx="2"
        fill="var(--muted-foreground)"
        opacity="0.6"
      />
      <rect
        x="56"
        y="12"
        width="4"
        height="40"
        rx="2"
        fill="var(--muted-foreground)"
        opacity="0.6"
      />
      <circle cx="32" cy="32" r="20" fill="var(--card)" stroke="var(--border)" strokeWidth="3" />
      <circle cx="32" cy="32" r="12" fill="var(--butter)" />
      <circle cx="28" cy="29" r="4" fill="var(--tomato)" />
      <circle cx="36" cy="35" r="3" fill="var(--basil)" />
    </svg>
  );
}
