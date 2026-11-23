import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { SERIES } from "@/components/charts/core";
import {
  buttonClass,
  fieldClass,
  PageHeader,
  relativeTime,
  StatusPlate,
} from "@/components/dashboard/ui";
import { type ItemFields, useDashboard } from "@/lib/dashboard/store";
import type { DatasetId, DatasetItem } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/dataset")({ component: DatasetPage });

const PAGE = 25;

function DatasetPage() {
  const {
    role,
    me,
    datasets,
    items,
    contributions,
    nowDate: now,
    person,
    dataset,
    addItem,
    suggest,
  } = useDashboard();
  const [active, setActive] = useState<DatasetId>(me.maintains[0] ?? "gyms");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [form, setForm] = useState<null | { target?: DatasetItem }>(null);
  const [message, setMessage] = useState<string | null>(null);
  const info = dataset(active);
  const direct = role === "admin" || me.maintains.includes(active);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((it) => it.dataset === active)
      .filter(
        (it) => !q || `${it.name} ${it.detail} ${it.tags.join(" ")}`.toLowerCase().includes(q),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [items, active, query]);
  const pendingEdits = new Set(
    contributions.filter((c) => c.status === "pending" && c.targetId).map((c) => c.targetId),
  );

  const submit = (fields: ItemFields) => {
    if (form?.target || !direct) {
      suggest(active, fields, form?.target?.id);
      setMessage(
        `Sent to the ${info.name} maintainers. You'll see it under Overview while it waits.`,
      );
    } else {
      addItem(active, fields);
      setMessage(`Added to ${info.name}. It is live now, and another maintainer will check it.`);
    }
    setForm(null);
  };

  return (
    <>
      <PageHeader
        title="Public dataset"
        lede="What every DevDAJ app can read. Anyone can browse it; changes from contributors wait for a maintainer."
        action={
          <button
            type="button"
            onClick={() => {
              setForm({});
              setMessage(null);
            }}
            className={cn(
              buttonClass,
              "h-11 bg-line-cobalt px-5 text-background hover:bg-brand/90",
            )}
          >
            <Plus className="size-4" />
            {direct ? `Add ${info.noun}` : `Suggest ${info.noun}`}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Dataset">
        {datasets.map((d) => {
          const count = items.filter((it) => it.dataset === d.id).length;
          const selected = d.id === active;
          return (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setActive(d.id);
                setLimit(PAGE);
                setForm(null);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition-colors",
                selected ? "border-foreground/60 bg-muted" : "border-border hover:bg-muted/60",
              )}
            >
              <span
                aria-hidden
                className="h-8 w-1.5 rounded-full"
                style={{ background: SERIES[d.series - 1] }}
              />
              <span>
                <span className="block font-bold">{d.name}</span>
                <span className="text-xs text-muted-foreground">
                  {count.toLocaleString()} · {d.app}
                  {me.maintains.includes(d.id) && " · yours"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {message && (
        <p className="mb-4 rounded-md border border-border bg-card px-4 py-3 text-sm" role="status">
          {message}
        </p>
      )}

      {form && (
        <ItemForm
          key={form.target?.id ?? "new"}
          title={
            form.target
              ? `Suggest an edit to ${form.target.name}`
              : direct
                ? `Add a ${info.noun}`
                : `Suggest a ${info.noun}`
          }
          note={
            form.target || !direct
              ? `A ${info.name} maintainer reviews it before it goes live.`
              : "Goes live straight away. Another maintainer can check or flag it."
          }
          initial={form.target}
          submitLabel={form.target || !direct ? "Send for review" : "Add"}
          onCancel={() => setForm(null)}
          onSubmit={submit}
        />
      )}

      <div className="mb-3 flex items-center gap-3">
        <label className="relative flex-1 sm:max-w-sm">
          <span className="sr-only">Search {info.name}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground/50" />
          <input
            className={cn(fieldClass, "pl-9")}
            placeholder={`Search ${info.name.toLowerCase()}`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
          />
        </label>
        <span className="text-sm text-muted-foreground tabular-nums">
          {rows.length.toLocaleString()} items
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <table className="m-0 w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-semibold">Name</th>
              <th className="px-4 py-2.5 font-semibold">Details</th>
              <th className="px-4 py-2.5 font-semibold">Added by</th>
              <th className="px-4 py-2.5 font-semibold">Updated</th>
              <th className="px-4 py-2.5 font-semibold">State</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((it) => {
              const by = person(it.addedBy);
              return (
                <tr
                  key={it.id}
                  className="border-b border-border/60 last:border-0 hover:bg-foreground/[0.03]"
                >
                  <td className="px-4 py-3 whitespace-normal">
                    <span className="font-semibold">{it.name}</span>
                    <span className="block text-xs text-muted-foreground">{it.detail}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-normal text-muted-foreground">
                    {it.tags.length ? (
                      it.tags.join(", ")
                    ) : (
                      <span className="text-foreground/40">None listed</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {by?.name ?? "Unknown"}
                    <span className="block text-xs text-muted-foreground">
                      {by?.role === "contributor" ? "Contributor" : "Maintainer"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {relativeTime(it.updatedAt, now)}
                  </td>
                  <td className="px-4 py-3 whitespace-normal">
                    {pendingEdits.has(it.id) ? (
                      <StatusPlate status="pending" />
                    ) : it.peerCheck?.status === "awaiting" ? (
                      <StatusPlate status="awaiting" />
                    ) : it.peerCheck?.status === "flagged" ? (
                      <StatusPlate status="flagged" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Live</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {role === "contributor" && (
                      <button
                        type="button"
                        onClick={() => {
                          setForm({ target: it });
                          setMessage(null);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-foreground/80 hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="size-3.5" /> Suggest edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No {info.name.toLowerCase()} match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE * 2)}
          className={cn(buttonClass, "mt-4 border border-border text-foreground hover:bg-muted")}
        >
          Show more ({(rows.length - limit).toLocaleString()} left)
        </button>
      )}
    </>
  );
}

function ItemForm({
  title,
  note,
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  title: string;
  note: string;
  initial?: DatasetItem;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (fields: ItemFields) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  return (
    <form
      className="mb-6 rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim().length < 2) return;
        onSubmit({
          name: name.trim(),
          detail: detail.trim(),
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        });
      }}
    >
      <h2 className="m-0 text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{note}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Name
          <input
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={120}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Details
          <input
            className={fieldClass}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={240}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Tags
          <input
            className={fieldClass}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Comma separated"
          />
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          className={cn(buttonClass, "bg-foreground text-background hover:bg-foreground/85")}
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={cn(buttonClass, "text-foreground/80 hover:bg-muted hover:text-foreground")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
