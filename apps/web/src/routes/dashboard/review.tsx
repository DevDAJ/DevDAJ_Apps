import { createFileRoute } from "@tanstack/react-router";
import { Check, Flag, ShieldAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { pct } from "@/components/charts/core";
import {
  buttonClass,
  DatasetChip,
  fieldClass,
  NotForRole,
  PageHeader,
  relativeTime,
  StatusPlate,
} from "@/components/dashboard/ui";
import { maintainerEligibility } from "@/lib/dashboard/rules";
import { useDashboard } from "@/lib/dashboard/store";
import type { Contribution, DatasetId } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/review")({ component: ReviewPage });

type Tab = "requests" | "peer" | "decided";

function ReviewPage() {
  const { role, me, contributions, items, datasets } = useDashboard();
  const [tab, setTab] = useState<Tab>("requests");
  const [filter, setFilter] = useState<DatasetId | "all">("all");
  if (role === "contributor") return <NotForRole />;

  const scope = role === "admin" ? datasets.map((d) => d.id) : me.maintains;
  const inScope = (ds: DatasetId) => scope.includes(ds) && (filter === "all" || ds === filter);
  const pending = contributions
    .filter((c) => c.status === "pending" && inScope(c.dataset))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const peer = items
    .filter(
      (it) =>
        it.peerCheck?.status === "awaiting" &&
        it.addedBy !== me.id &&
        (filter === "all" || it.dataset === filter),
    )
    .sort(
      (a, b) =>
        Number(scope.includes(b.dataset)) - Number(scope.includes(a.dataset)) ||
        a.addedAt.localeCompare(b.addedAt),
    );
  const decided = contributions
    .filter(
      (c) =>
        c.status !== "pending" &&
        inScope(c.dataset) &&
        (role === "admin" || c.reviewedBy === me.id),
    )
    .sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""))
    .slice(0, 50);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "requests", label: "Contributor requests", count: pending.length },
    { id: "peer", label: "Peer checks", count: peer.length },
    { id: "decided", label: role === "admin" ? "Recent decisions" : "Your decisions" },
  ];

  return (
    <>
      <PageHeader
        title="Review"
        lede={
          role === "admin"
            ? "Every dataset's queue. Admins can step in on any request."
            : "Requests for your datasets, oldest first, and items other maintainers added for you to check."
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <div role="tablist" className="flex gap-5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px flex cursor-pointer items-center gap-2 border-b-2 py-2.5 text-sm font-semibold",
                tab === t.id
                  ? "border-brand text-foreground"
                  : "border-transparent text-foreground/70 hover:text-foreground",
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span className="rounded-full bg-muted px-1.5 text-[11px] leading-5 tabular-nums">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <select
          aria-label="Dataset"
          className={cn(fieldClass, "mb-2 h-9 w-auto")}
          value={filter}
          onChange={(e) => setFilter(e.target.value as DatasetId | "all")}
        >
          <option value="all">{role === "admin" ? "All datasets" : "All my datasets"}</option>
          {datasets
            .filter((d) => tab === "peer" || scope.includes(d.id))
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
      </div>

      {tab === "requests" &&
        (pending.length ? (
          <div className="flex flex-col gap-3">
            {pending.map((c) => (
              <RequestCard key={c.id} c={c} />
            ))}
          </div>
        ) : (
          <Empty text="Nothing waiting. Nice." />
        ))}

      {tab === "peer" && <PeerChecks itemsToCheck={peer} scope={scope} />}

      {tab === "decided" && (
        <ul className="border-t border-border">
          {decided.map((c) => (
            <DecidedRow key={c.id} c={c} />
          ))}
          {decided.length === 0 && <Empty text="No decisions yet." />}
        </ul>
      )}
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
      {text}
    </p>
  );
}

function RequestCard({ c }: { c: Contribution }) {
  const { contributions, items, nowDate: now, person, dataset, review } = useDashboard();
  const [note, setNote] = useState("");
  const submitter = person(c.submittedBy);
  const record = useMemo(
    () =>
      maintainerEligibility(
        contributions.filter((x) => x.submittedBy === c.submittedBy),
        now,
      ),
    [contributions, c.submittedBy, now],
  );
  const target = c.targetId ? items.find((it) => it.id === c.targetId) : null;

  return (
    <article className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <DatasetChip dataset={dataset(c.dataset)} className="text-xs" />·
            <span>{c.kind === "edit" ? "Edit" : "New item"}</span>·
            <span>{relativeTime(c.submittedAt, now)}</span>
          </div>
          <h3 className="mt-1 text-lg font-bold tracking-tight">{c.title}</h3>
        </div>
        <div className="text-right text-xs">
          <div className="font-semibold">{submitter?.name}</div>
          <div
            className={record.reliable ? "text-muted-foreground" : "font-semibold text-destructive"}
          >
            {record.reviewed} reviewed · {pct(record.flaggedRate)} flagged
          </div>
        </div>
      </div>

      <dl className={cn("mt-3 grid grid-cols-1 gap-3 text-sm", target && "sm:grid-cols-2")}>
        {target && (
          <Fields title="Now" name={target.name} detail={target.detail} tags={target.tags} />
        )}
        <Fields
          title={target ? "Proposed" : "Details"}
          name={c.title}
          detail={c.detail}
          tags={c.tags}
          compare={target ?? undefined}
        />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          className={cn(fieldClass, "h-9 min-w-48 flex-1")}
          placeholder="Note to contributor (optional)"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="button"
          onClick={() => review(c.id, "approved", note)}
          className={cn(buttonClass, "bg-foreground text-background hover:bg-foreground/85")}
        >
          <Check className="size-4" /> Approve
        </button>
        <button
          type="button"
          onClick={() => review(c.id, "rejected", note)}
          className={cn(buttonClass, "border border-border text-foreground hover:bg-muted")}
        >
          <X className="size-4" /> Reject
        </button>
        <button
          type="button"
          onClick={() => review(c.id, "unreliable", note)}
          title="Counts against the contributor's maintainer eligibility"
          className={cn(
            buttonClass,
            "border border-destructive/50 text-destructive hover:bg-destructive/10",
          )}
        >
          <ShieldAlert className="size-4" /> Unreliable
        </button>
        <button
          type="button"
          onClick={() => review(c.id, "spam", note)}
          title="Counts against the contributor's maintainer eligibility"
          className={cn(
            buttonClass,
            "border border-destructive/50 text-destructive hover:bg-destructive/10",
          )}
        >
          <Flag className="size-4" /> Spam
        </button>
      </div>
    </article>
  );
}

function Fields({
  title,
  name,
  detail,
  tags,
  compare,
}: {
  title: string;
  name: string;
  detail: string;
  tags: string[];
  compare?: { name: string; detail: string; tags: string[] };
}) {
  const changed = (a: unknown, b: unknown) => compare && JSON.stringify(a) !== JSON.stringify(b);
  const mark = "rounded-sm bg-line-amber/20 px-1 -mx-1";
  return (
    <div className="rounded-md border border-border/70 p-3">
      <dt className="mb-1 text-xs font-bold tracking-[0.025em] text-muted-foreground uppercase">
        {title}
      </dt>
      <dd className={cn("font-semibold", changed(name, compare?.name) && mark)}>{name}</dd>
      <dd className={cn("text-muted-foreground", changed(detail, compare?.detail) && mark)}>
        {detail || "No details"}
      </dd>
      <dd className={cn("text-muted-foreground", changed(tags, compare?.tags) && mark)}>
        {tags.length ? tags.join(", ") : "No tags"}
      </dd>
    </div>
  );
}

function PeerChecks({
  itemsToCheck,
  scope,
}: {
  itemsToCheck: ReturnType<typeof useDashboard>["items"];
  scope: DatasetId[];
}) {
  const { me, items, nowDate: now, person, dataset, peerCheck } = useDashboard();
  const mine = items
    .filter((it) => it.addedBy === me.id && it.peerCheck)
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[3fr_2fr]">
      <section>
        <p className="mb-3 text-sm text-muted-foreground">
          Items maintainers added directly. They are already live; confirm them or flag them for the
          adding maintainer.
        </p>
        {itemsToCheck.length === 0 ? (
          <Empty text="No items waiting for a check." />
        ) : (
          <ul className="border-t border-border">
            {itemsToCheck.map((it) => (
              <li
                key={it.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3"
              >
                <span className="min-w-0">
                  <span className="block font-semibold">{it.name}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <DatasetChip dataset={dataset(it.dataset)} className="text-xs" />· {it.detail} ·
                    by {person(it.addedBy)?.name} · {relativeTime(it.addedAt, now)}
                    {scope.includes(it.dataset) && (
                      <span className="font-semibold text-foreground">· your dataset</span>
                    )}
                  </span>
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => peerCheck(it.id, "confirmed")}
                    className={cn(
                      buttonClass,
                      "h-8 bg-foreground px-3 text-background hover:bg-foreground/85",
                    )}
                  >
                    <Check className="size-4" /> Looks right
                  </button>
                  <button
                    type="button"
                    onClick={() => peerCheck(it.id, "flagged")}
                    className={cn(
                      buttonClass,
                      "h-8 border border-destructive/50 px-3 text-destructive hover:bg-destructive/10",
                    )}
                  >
                    <Flag className="size-4" /> Flag
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {mine.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold">What you added</h3>
          <ul className="border-t border-border">
            {mine.slice(0, 12).map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between gap-3 border-b border-border py-2.5 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{it.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(it.addedAt, now)}
                    {it.peerCheck?.by && ` · checked by ${person(it.peerCheck.by)?.name}`}
                  </span>
                </span>
                <StatusPlate status={it.peerCheck!.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DecidedRow({ c }: { c: Contribution }) {
  const { nowDate: now, person, dataset } = useDashboard();
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-border py-3">
      <span className="min-w-0">
        <span className="block truncate font-semibold">
          {c.kind === "edit" ? "Edit: " : ""}
          {c.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <DatasetChip dataset={dataset(c.dataset)} className="text-xs" />· from{" "}
          {person(c.submittedBy)?.name} · decided by {person(c.reviewedBy)?.name}{" "}
          {c.reviewedAt && relativeTime(c.reviewedAt, now)}
        </span>
      </span>
      <StatusPlate status={c.status} />
    </li>
  );
}
