import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ChartFrame, pct, SERIES, shortDate } from "@/components/charts/core";
import { Meter, StatTile } from "@/components/charts/figures";
import { StackedColumns } from "@/components/charts/StackedColumns";
import { dailyRequests, monthToDate, type PlanId, PLANS, planOf, usd } from "@/lib/dashboard/api";
import { useDashboard } from "@/lib/dashboard/store";
import { cn } from "@/lib/utils";
import { buttonClass, fieldClass, PageHeader, relativeTime, SectionTitle } from "./ui";

/** Every signed-in account: buy a plan, manage tokens, watch usage. */
export function DeveloperApi() {
  const { me, api, datasets, subscribe, cancelSubscription } = useDashboard();
  const sub = api.subscriptions.find((s) => s.ownerId === me.id && !s.cancelledAt);

  return (
    <>
      <PageHeader
        title="Developer API"
        lede="The dataset is free to browse here and inside DevDAJ apps. To use it in your own app, pick a monthly plan and call the API with a token."
      />
      {sub ? (
        <ActivePlan key={sub.id} subscriptionId={sub.id} />
      ) : (
        <PlanPicker onPick={(plan, app) => subscribe(plan, app)} />
      )}
      {!sub && (
        <p className="mt-6 text-sm text-muted-foreground">
          Covers all {datasets.length} datasets ({datasets.map((d) => d.name).join(", ")}). Cancel
          any time; tokens stop working at the end of the paid month.
        </p>
      )}
      {sub && (
        <p className="mt-10 text-sm text-muted-foreground">
          Not building anymore?{" "}
          <button
            type="button"
            onClick={cancelSubscription}
            className="cursor-pointer font-semibold text-destructive underline-offset-4 hover:underline"
          >
            Cancel plan
          </button>{" "}
          (preview: takes effect immediately and revokes every token).
        </p>
      )}
    </>
  );
}

function PlanPicker({
  onPick,
  current,
}: {
  onPick: (plan: PlanId, app: string) => void;
  current?: PlanId;
}) {
  const [app, setApp] = useState("");
  return (
    <section>
      {!current && (
        <label className="mb-4 flex max-w-md flex-col gap-1 text-sm font-semibold">
          What are you building?
          <input
            className={fieldClass}
            placeholder="e.g. Gym directory for Klang Valley"
            value={app}
            maxLength={80}
            onChange={(e) => setApp(e.target.value)}
          />
        </label>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === current;
          return (
            <article
              key={plan.id}
              className={cn(
                "flex flex-col gap-3 rounded-2xl border bg-card p-5",
                isCurrent ? "border-foreground/60" : "border-border",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="m-0 text-lg font-semibold tracking-tight">{plan.name}</h3>
                <span>
                  <span className="text-2xl font-semibold">{usd(plan.price)}</span>
                  <span className="text-sm text-muted-foreground"> / month</span>
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{plan.blurb}</p>
              <ul className="flex flex-col gap-1.5 text-sm">
                <li>{plan.quota.toLocaleString()} requests a month</li>
                <li>{plan.rateLimit} requests a second per token</li>
                <li>Up to {plan.maxTokens} tokens</li>
              </ul>
              <button
                type="button"
                disabled={isCurrent}
                onClick={() => onPick(plan.id, app.trim())}
                className={cn(
                  buttonClass,
                  "mt-auto h-10",
                  isCurrent
                    ? "border border-border text-foreground"
                    : "bg-brand text-brand-foreground hover:bg-brand/90",
                )}
              >
                {isCurrent
                  ? "Current plan"
                  : current
                    ? `Switch to ${plan.name}`
                    : `Start ${plan.name}`}
              </button>
            </article>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Preview: no payment is taken and prices are placeholders.
      </p>
    </section>
  );
}

function ActivePlan({ subscriptionId }: { subscriptionId: string }) {
  const { api, datasets, nowDate: now, subscribe, createToken, revokeToken } = useDashboard();
  const sub = api.subscriptions.find((s) => s.id === subscriptionId)!;
  const plan = planOf(sub.plan);
  const tokens = api.tokens.filter((t) => t.subscriptionId === sub.id);
  const live = tokens.filter((t) => !t.revokedAt);
  const ids = useMemo(() => new Set(tokens.map((t) => t.id)), [tokens]);
  const mine = useMemo(() => api.usage.filter((u) => ids.has(u.tokenId)), [api.usage, ids]);
  const mtd = monthToDate(mine, ids, now);
  const daily = useMemo(() => dailyRequests(mine, now, 30), [mine, now]);
  const used = mtd.requests / plan.quota;
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [changing, setChanging] = useState(false);
  const series = datasets.map((d) => ({ key: d.id, label: d.name, color: SERIES[d.series - 1] }));

  return (
    <>
      <section className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm text-muted-foreground">{sub.app}</div>
            <h2 className="m-0 text-xl font-semibold tracking-tight">
              {plan.name} · {usd(plan.price)}/month
            </h2>
            <div className="mt-1 text-sm text-muted-foreground">
              Renews{" "}
              {new Date(sub.renewsAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
              })}{" "}
              · {plan.rateLimit} requests a second per token
            </div>
          </div>
          <button
            type="button"
            onClick={() => setChanging((v) => !v)}
            className={cn(buttonClass, "border border-border text-foreground hover:bg-muted")}
          >
            {changing ? "Keep plan" : "Change plan"}
          </button>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">Requests this month</span>
            <span className="tabular-nums">
              <b>{mtd.requests.toLocaleString()}</b>
              <span className="text-muted-foreground">
                {" "}
                of {plan.quota.toLocaleString()} · {pct(used)}
              </span>
            </span>
          </div>
          <Meter
            value={mtd.requests}
            max={plan.quota}
            tone={used >= 1 ? "bad" : used >= 0.8 ? "warn" : "ok"}
            label="Requests this month against the plan quota"
          />
          <span className="mt-1 text-xs text-muted-foreground">
            {mtd.limited > 0
              ? `${mtd.limited.toLocaleString()} requests were refused for going over the rate limit this month.`
              : "Nothing refused this month."}{" "}
            Over the quota, calls get HTTP 429 until the plan renews or you upgrade.
          </span>
        </div>
      </section>

      {changing && (
        <div className="mt-4">
          <PlanPicker
            current={sub.plan}
            onPick={(p) => {
              subscribe(p, sub.app);
              setChanging(false);
            }}
          />
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Requests, last 30 days"
          value={daily
            .reduce((s, d) => s + Object.values(d.values).reduce((a, b) => a + b, 0), 0)
            .toLocaleString()}
        />
        <StatTile
          label="Busiest day"
          value={Math.max(
            ...daily.map((d) => Object.values(d.values).reduce((a, b) => a + b, 0)),
          ).toLocaleString()}
        />
        <StatTile label="Active tokens" value={`${live.length} of ${plan.maxTokens}`} />
        <StatTile label="Refused (429), this month" value={mtd.limited.toLocaleString()} />
      </div>

      <div className="mt-4">
        <ChartFrame
          title="Requests per day"
          subtitle="Last 30 days, by dataset"
          legend={series.map((s) => ({ label: s.label, color: s.color }))}
          table={{
            columns: ["Day", ...series.map((s) => s.label), "Refused"],
            rows: daily.map((d) => [
              shortDate(d.day),
              ...series.map((s) => d.values[s.key]),
              d.limited,
            ]),
          }}
        >
          <StackedColumns
            data={daily.map((d) => ({ x: d.day, values: d.values }))}
            series={series}
            label="Requests per day by dataset"
            formatX={shortDate}
          />
        </ChartFrame>
      </div>

      <SectionTitle hint={`${live.length} of ${plan.maxTokens} in use`}>Tokens</SectionTitle>
      {secret && (
        <div
          className="mb-4 rounded-2xl border border-brand/60 bg-brand/10 p-4 text-sm"
          role="status"
        >
          <p className="font-semibold">Copy this token now. It won't be shown again.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-surface px-3 py-2 font-mono text-[13px] break-all">
              {secret}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(secret).then(() => setCopied(true));
              }}
              className={cn(buttonClass, "h-8 border border-border text-foreground hover:bg-muted")}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{" "}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => setSecret(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Done
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Preview token: it isn't accepted by the API yet.
          </p>
        </div>
      )}
      <ul className="border-t border-border">
        {tokens.map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3"
          >
            <span className="flex min-w-0 items-center gap-3">
              <KeyRound
                className={cn("size-4 shrink-0", t.revokedAt ? "text-foreground/30" : "text-brand")}
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    "block font-semibold",
                    t.revokedAt && "text-foreground/50 line-through",
                  )}
                >
                  {t.name}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {t.prefix}_••••{t.last4} · created {relativeTime(t.createdAt, now)} ·{" "}
                  {t.revokedAt
                    ? `revoked ${relativeTime(t.revokedAt, now)}`
                    : t.lastUsedAt
                      ? `used ${relativeTime(t.lastUsedAt, now)}`
                      : "never used"}
                </span>
              </span>
            </span>
            {!t.revokedAt && (
              <button
                type="button"
                onClick={() => revokeToken(t.id)}
                className={cn(
                  buttonClass,
                  "h-8 border border-destructive/50 px-3 text-destructive hover:bg-destructive/10",
                )}
              >
                <Trash2 className="size-4" /> Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (live.length >= plan.maxTokens) return;
          setSecret(createToken(name.trim()));
          setCopied(false);
          setName("");
        }}
      >
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm font-semibold sm:max-w-sm">
          New token
          <input
            className={fieldClass}
            placeholder="e.g. Production"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={live.length >= plan.maxTokens}
          className={cn(buttonClass, "h-10 bg-foreground text-background hover:bg-foreground/85")}
        >
          Create token
        </button>
        {live.length >= plan.maxTokens && (
          <span className="w-full text-xs text-muted-foreground">
            Your plan's token limit is reached. Revoke one or change plan.
          </span>
        )}
      </form>

      <SectionTitle>Quick start</SectionTitle>
      <pre className="overflow-x-auto rounded-2xl border border-border shadow-[var(--shadow-soft)] bg-surface p-4 text-[13px] leading-relaxed">
        <code>{`curl "https://<devdaj-host>/api/v1/dataset/gyms?lat=3.13&lng=101.67&radiusKm=5" \\
  -H "Authorization: Bearer ddk_live_…"`}</code>
      </pre>
      <p className="mt-2 text-xs text-muted-foreground">
        Illustrative: the endpoint is public today and does not check tokens yet. Responses match
        the in-app dataset.
      </p>
    </>
  );
}
