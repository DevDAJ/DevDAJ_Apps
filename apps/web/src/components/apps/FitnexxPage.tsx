import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ClipboardList,
  Droplet,
  Dumbbell,
  MapPin,
  UtensilsCrossed,
} from "lucide-react";
import type { ComponentType } from "react";
import { type AppEntry, findApp } from "@/catalog";
import { SERVICE } from "@/components/transit/lines";
import { cn } from "@/lib/utils";
import { BackLink, otherApps, PartnerName, StoreButtons } from "./shared";

/*
 * Fitnexx: a rugged training floor. Square corners, a visible steel grid, heavy 2px frames,
 * tall condensed type, scarlet as the only colour and hazard tape for anything not running yet.
 */

type Icon = ComponentType<{ className?: string }>;
const STOP_ICON: Record<string, Icon> = {
  Workouts: Dumbbell,
  Meals: UtensilsCrossed,
  "Body & water": Droplet,
};
const HIGHLIGHT_ICONS: Icon[] = [ClipboardList, Activity, MapPin];

const frame = "border-2 border-foreground/85";
const heading =
  "font-display text-[clamp(2.6rem,5vw,4.25rem)] leading-[0.9] font-extrabold tracking-[0.005em] uppercase";
const label = "text-xs font-semibold tracking-[0.16em] uppercase";

/** Registration ticks in a cell's corners, like marks on a steel plate. */
function Ticks() {
  return (
    <>
      {["top-1.5 left-1.5", "top-1.5 right-1.5", "bottom-1.5 left-1.5", "bottom-1.5 right-1.5"].map(
        (pos) => (
          <span key={pos} aria-hidden className={cn("pointer-events-none absolute size-2.5", pos)}>
            <span className="absolute top-1/2 left-0 h-px w-full bg-foreground/35" />
            <span className="absolute top-0 left-1/2 h-full w-px bg-foreground/35" />
          </span>
        ),
      )}
    </>
  );
}

export function FitnexxPage({ app }: { app: AppEntry }) {
  const running = !SERVICE[app.status].planned;
  return (
    <main className="grid-plate">
      <section className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-8">
        <BackLink />

        {/* Hero: a spec board of welded cells. */}
        <div className={cn("mt-8 grid grid-cols-1 bg-background lg:grid-cols-12", frame)}>
          <div className="relative border-foreground/85 p-6 sm:p-10 lg:col-span-7 lg:border-r-2">
            <Ticks />
            <span
              className={cn(
                label,
                "inline-flex h-7 items-center gap-2 border-2 px-2.5",
                running ? "border-brand text-brand" : "border-foreground/50 text-muted-foreground",
              )}
            >
              <span aria-hidden className={cn("size-2", running ? "bg-brand" : "hazard")} />
              {SERVICE[app.status].label}
            </span>
            <h1 className="mt-6 font-display text-[clamp(5rem,15vw,11rem)] leading-[0.8] font-black tracking-[-0.01em] uppercase">
              {app.name}
            </h1>
            <p className="mt-6 max-w-[30ch] font-display text-[clamp(1.6rem,2.4vw,2.1rem)] leading-[1.05] font-bold uppercase">
              {app.tagline}
            </p>
            <p className="mt-4 max-w-[52ch] text-lg leading-relaxed text-muted-foreground">
              {app.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <StoreButtons
                app={app}
                buttonClass="inline-flex h-13 items-center gap-2.5 border-2 border-brand bg-brand px-6 text-sm font-bold tracking-[0.12em] text-brand-foreground uppercase no-underline transition-colors hover:bg-transparent hover:text-brand"
                emptyClass={cn(
                  label,
                  "inline-flex h-13 items-center border-2 border-dashed border-foreground/40 px-6 text-muted-foreground",
                )}
              />
              <a
                href="#works-with"
                className="inline-flex h-13 items-center gap-2 border-2 border-foreground/60 px-6 text-sm font-bold tracking-[0.12em] text-foreground uppercase no-underline transition-colors hover:border-foreground hover:bg-foreground hover:text-background"
              >
                Works with
                <ArrowRight className="size-4" aria-hidden />
              </a>
            </div>
          </div>

          {/* What it tracks: one heavy row per area. */}
          <div className="flex flex-col border-t-2 border-foreground/85 lg:col-span-5 lg:border-t-0">
            <div
              className={cn(
                label,
                "flex items-center justify-between border-b-2 border-foreground/85 px-6 py-4 text-muted-foreground",
              )}
            >
              <span>What it tracks</span>
              <span aria-hidden>{app.stops.length.toString().padStart(2, "0")}</span>
            </div>
            {app.stops.map((stop) => {
              const Icon = STOP_ICON[stop] ?? Dumbbell;
              return (
                <div
                  key={stop}
                  className="group relative flex flex-1 items-center gap-5 border-b-2 border-foreground/85 px-6 py-7 last:border-b-0"
                >
                  <span className="flex size-14 shrink-0 items-center justify-center bg-brand text-brand-foreground">
                    <Icon className="size-7" />
                  </span>
                  <span className="font-display text-[2.6rem] leading-none font-extrabold uppercase">
                    {stop}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Highlights: three cells welded side by side. */}
      <section className="mx-auto max-w-[80rem] px-4 pt-24 sm:px-8">
        <h2 className={heading}>Built for the gym floor</h2>
        <ul className={cn("mt-8 grid grid-cols-1 bg-background md:grid-cols-3", frame)}>
          {app.highlights.map((highlight, i) => {
            const Icon = HIGHLIGHT_ICONS[i % HIGHLIGHT_ICONS.length];
            return (
              <li
                key={highlight}
                className="relative flex min-h-56 flex-col justify-between gap-10 border-b-2 border-foreground/85 p-7 last:border-b-0 md:border-r-2 md:border-b-0 md:last:border-r-0"
              >
                <Ticks />
                <Icon className="size-9 text-brand" />
                <p className="font-display text-[1.9rem] leading-[1.02] font-bold uppercase">
                  {highlight}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* How it works with the other apps: a load sheet. */}
      <section id="works-with" className="mx-auto max-w-[80rem] scroll-mt-24 px-4 pt-24 sm:px-8">
        <h2 className={heading}>Works with</h2>
        <p className="mt-3 max-w-[56ch] text-lg text-muted-foreground">
          Everything passes through an encrypted folder on your phone, never through a server.
        </p>
        <div className={cn("mt-8 bg-background", frame)}>
          <div
            className={cn(
              label,
              "hidden grid-cols-[14rem_1fr_9rem] border-b-2 border-foreground/85 px-6 py-3 text-muted-foreground md:grid",
            )}
          >
            <span>With</span>
            <span>What moves</span>
            <span className="text-right">State</span>
          </div>
          {app.transfers.map((t) => {
            const planned = t.status === "planned";
            return (
              <div
                key={`${t.with}-${t.carries}`}
                className="grid grid-cols-1 gap-2 border-b-2 border-foreground/85 px-6 py-5 last:border-b-0 md:grid-cols-[14rem_1fr_9rem] md:items-center md:gap-6"
              >
                <span className="flex items-center gap-2 font-display text-xl font-bold uppercase">
                  {t.direction === "in" ? "From" : "To"} <PartnerName transfer={t} />
                </span>
                <span className="text-[1.05rem]">{t.carries}</span>
                <span
                  className={cn(
                    "inline-flex h-8 w-fit md:justify-self-end",
                    planned ? "hazard p-[3px]" : "bg-brand",
                  )}
                >
                  <span
                    className={cn(
                      label,
                      "inline-flex items-center px-3",
                      planned ? "bg-background text-foreground" : "text-brand-foreground",
                    )}
                  >
                    {planned ? "Planned" : "Running"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Other apps. */}
      <section className="mx-auto max-w-[80rem] px-4 pt-24 pb-24 sm:px-8">
        <h2 className={heading}>Other DevDAJ apps</h2>
        <ul className={cn("mt-8 grid grid-cols-1 bg-background sm:grid-cols-2", frame)}>
          {otherApps(app).map((other) => (
            <li
              key={other.slug}
              className="border-b-2 border-foreground/85 last:border-b-0 sm:border-r-2 sm:border-b-0 sm:last:border-r-0"
            >
              <Link
                to="/apps/$slug"
                params={{ slug: other.slug }}
                className="group flex items-center justify-between gap-4 p-6 text-foreground no-underline transition-colors hover:bg-foreground hover:text-background"
              >
                <span>
                  <span className="block font-display text-3xl font-extrabold uppercase">
                    {findApp(other.slug)?.name}
                  </span>
                  <span className="mt-1 block text-sm opacity-70">{other.tagline}</span>
                </span>
                <ArrowUpRight
                  className="size-6 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
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
