import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { AppEntry } from "@/catalog";
import { SERVICE } from "@/components/transit/lines";
import { cn } from "@/lib/utils";
import { BackLink, otherApps, PartnerName, StoreButtons } from "./shared";

/*
 * Finance Tracker: an accountant's ledger. Warm graphite paper with ruled lines, a bookish serif,
 * amber as the ink you sign with. Content reads as ledger entries, never as invented figures.
 */

const entryRow =
  "grid grid-cols-[2.5rem_1fr] items-baseline gap-4 border-b border-border py-4 sm:grid-cols-[3rem_1fr_auto]";

export function FinancePage({ app }: { app: AppEntry }) {
  const planned = SERVICE[app.status].planned;
  return (
    <main>
      <section className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-8">
        <BackLink />
        <div className="mt-10 grid grid-cols-1 items-start gap-12 lg:grid-cols-[1fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 border-b border-brand pb-1 font-display text-base text-brand italic">
              {planned ? "Not yet opened" : SERVICE[app.status].label}
            </span>
            <h1 className="mt-6 font-display text-[clamp(3.4rem,8vw,6.25rem)] leading-[0.95] font-medium tracking-[-0.02em]">
              {app.name}
            </h1>
            <p className="mt-6 max-w-[30ch] font-display text-[1.65rem] leading-snug italic">
              {app.tagline}
            </p>
            <p className="mt-4 max-w-[48ch] text-lg leading-relaxed text-muted-foreground">
              {app.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <StoreButtons
                app={app}
                buttonClass="inline-flex h-12 items-center gap-2 rounded-[var(--radius)] bg-brand px-6 font-semibold text-brand-foreground no-underline hover:opacity-90"
                emptyClass="inline-flex h-12 items-center rounded-[var(--radius)] border border-dashed border-foreground/30 px-6 text-muted-foreground"
              />
            </div>
          </div>

          {/* The ledger: what it will keep, as entries on ruled paper. */}
          <figure className="ledger-rule relative m-0 rounded-[var(--radius)] border border-border bg-card p-7 shadow-[var(--shadow-lift)]">
            <span aria-hidden className="absolute top-0 bottom-0 left-14 w-px bg-brand/50" />
            <figcaption className="flex items-baseline justify-between border-b-2 border-foreground/70 pb-3 pl-10">
              <span className="font-display text-2xl">Ledger</span>
              <span className="text-sm text-muted-foreground">kept on your phone</span>
            </figcaption>
            <ol className="pl-10">
              {app.stops.map((stop, i) => (
                <li key={stop} className="flex items-baseline gap-3 border-b border-border py-3.5">
                  <span className="w-6 font-display text-sm text-muted-foreground tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-display text-xl">{stop}</span>
                  <span
                    aria-hidden
                    className="mx-1 flex-1 translate-y-[-3px] border-b border-dotted border-foreground/30"
                  />
                  <span className="text-sm text-muted-foreground italic">
                    {planned ? "planned" : "tracked"}
                  </span>
                </li>
              ))}
              <li className="flex items-baseline gap-3 py-3.5">
                <span className="w-6" />
                <span className="font-display text-xl text-brand">Shared with</span>
                <span
                  aria-hidden
                  className="mx-1 flex-1 translate-y-[-3px] border-b border-dotted border-foreground/30"
                />
                <span className="text-sm text-muted-foreground italic">no one</span>
              </li>
            </ol>
          </figure>
        </div>
      </section>

      <section className="mx-auto max-w-[80rem] px-4 pt-28 sm:px-8">
        <h2 className="font-display text-[clamp(2.2rem,4vw,3.25rem)] leading-none font-medium tracking-tight">
          In the books
        </h2>
        <ol className="mt-8 border-t-2 border-foreground/70">
          {app.highlights.map((h, i) => (
            <li key={h} className={entryRow}>
              <span className="font-display text-xl text-brand tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-display text-[1.65rem] leading-snug">{h}</span>
              <span className="hidden text-sm text-muted-foreground italic sm:block">
                {planned ? "planned" : "included"}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-[80rem] px-4 pt-28 sm:px-8">
        <h2 className="font-display text-[clamp(2.2rem,4vw,3.25rem)] leading-none font-medium tracking-tight">
          Shared with other apps
        </h2>
        {app.transfers.length === 0 ? (
          <p className="mt-6 max-w-[56ch] border-t-2 border-foreground/70 pt-6 text-lg text-muted-foreground">
            Nothing yet. When it opens, anything it shares will stay in the encrypted folder on your
            phone.
          </p>
        ) : (
          <ul className="mt-8 border-t-2 border-foreground/70">
            {app.transfers.map((t) => (
              <li key={`${t.with}-${t.carries}`} className={entryRow}>
                <span className="text-sm text-muted-foreground">
                  {t.direction === "in" ? "From" : "To"}
                </span>
                <span className="font-display text-xl">
                  <PartnerName transfer={t} />: {t.carries}
                </span>
                <span className="hidden text-sm italic sm:block">{t.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mx-auto max-w-[80rem] px-4 pt-28 pb-28 sm:px-8">
        <h2 className="font-display text-[clamp(2.2rem,4vw,3.25rem)] leading-none font-medium tracking-tight">
          Other DevDAJ apps
        </h2>
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {otherApps(app).map((other) => (
            <li key={other.slug}>
              <Link
                to="/apps/$slug"
                params={{ slug: other.slug }}
                className={cn(
                  "group flex items-center justify-between gap-4 rounded-[var(--radius)] border border-border bg-card p-6 text-foreground no-underline shadow-[var(--shadow-soft)] transition-colors hover:border-brand/60",
                )}
              >
                <span>
                  <span className="block font-display text-2xl">{other.name}</span>
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
