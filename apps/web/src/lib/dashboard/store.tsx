/**
 * Dashboard state for the design preview: seeded data held in memory, with the actions each role
 * can take. Changes last until reload. Swap this provider for one backed by the platform API later;
 * the pages only use `useDashboard()`.
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { type ApiToken, newTokenSecret, type PlanId } from "./api";
import { createMockData, PERSONAS } from "./mock";
import type {
  Contribution,
  ContributionStatus,
  DashboardData,
  DatasetId,
  DatasetInfo,
  DatasetItem,
  MaintainerApplication,
  Person,
  Role,
} from "./types";

export interface ItemFields {
  name: string;
  detail: string;
  tags: string[];
}

interface DashboardContextValue extends DashboardData {
  role: Role;
  setRole: (role: Role) => void;
  me: Person;
  nowDate: Date;
  person: (id: string | null | undefined) => Person | undefined;
  dataset: (id: DatasetId) => DatasetInfo;
  /** Maintainer or admin decides a contributor's request. */
  review: (id: string, status: Exclude<ContributionStatus, "pending">, note?: string) => void;
  /** Maintainer adds an item directly; it goes live and waits for a peer check. */
  addItem: (dataset: DatasetId, fields: ItemFields) => void;
  /** Contributor suggests a new item or an edit. */
  suggest: (dataset: DatasetId, fields: ItemFields, targetId?: string) => void;
  peerCheck: (itemId: string, status: "confirmed" | "flagged") => void;
  apply: (
    dataset: DatasetId,
    motivation: string,
    snapshot: MaintainerApplication["snapshot"],
  ) => void;
  decideApplication: (id: string, status: "approved" | "declined") => void;
  /** Start or change the signed-in person's API plan (no payment in the preview). */
  subscribe: (plan: PlanId, app: string) => void;
  cancelSubscription: () => void;
  /** Creates a token and returns its secret, which is shown once. */
  createToken: (name: string) => string;
  revokeToken: (id: string) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);
const ROLE_KEY = "devdaj.dashboard.role";

function readRole(): Role {
  try {
    const value = window.localStorage.getItem(ROLE_KEY);
    if (value === "admin" || value === "maintainer" || value === "contributor") return value;
  } catch {
    // Storage blocked: fall back to the default.
  }
  return "admin";
}

let seq = 0;
const newId = (prefix: string) => `${prefix}-new-${++seq}`;

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData>(() => createMockData());
  const [role, setRoleState] = useState<Role>(readRole);

  const setRole = useCallback((next: Role) => {
    setRoleState(next);
    try {
      window.localStorage.setItem(ROLE_KEY, next);
    } catch {
      // Not persisted; fine for a preview.
    }
  }, []);

  const value = useMemo<DashboardContextValue>(() => {
    const byId = new Map(data.people.map((p) => [p.id, p]));
    const me = byId.get(PERSONAS[role])!;
    const nowIso = new Date().toISOString();
    const update = (fn: (d: DashboardData) => Partial<DashboardData>) =>
      setData((d) => ({ ...d, ...fn(d) }));

    return {
      ...data,
      role,
      setRole,
      me,
      nowDate: new Date(data.now),
      person: (id) => (id ? byId.get(id) : undefined),
      dataset: (id) => data.datasets.find((d) => d.id === id)!,
      review: (id, status, note) =>
        update((d) => {
          const target = d.contributions.find((c) => c.id === id);
          if (!target || target.status !== "pending") return {};
          const decided: Contribution = {
            ...target,
            status,
            reviewedBy: me.id,
            reviewedAt: nowIso,
            note: note || target.note,
          };
          let items = d.items;
          if (status === "approved") {
            items = target.targetId
              ? d.items.map((it) =>
                  it.id === target.targetId
                    ? {
                        ...it,
                        name: target.title,
                        detail: target.detail,
                        tags: target.tags,
                        updatedAt: nowIso,
                      }
                    : it,
                )
              : [
                  ...d.items,
                  {
                    id: newId("i"),
                    dataset: target.dataset,
                    name: target.title,
                    detail: target.detail,
                    tags: target.tags,
                    addedBy: target.submittedBy,
                    addedAt: nowIso,
                    updatedAt: nowIso,
                    peerCheck: null,
                  },
                ];
          }
          return {
            items,
            contributions: d.contributions.map((c) => (c.id === id ? decided : c)),
          };
        }),
      addItem: (dataset, fields) =>
        update((d) => ({
          items: [
            ...d.items,
            {
              id: newId("i"),
              dataset,
              ...fields,
              addedBy: me.id,
              addedAt: nowIso,
              updatedAt: nowIso,
              peerCheck: { status: "awaiting" },
            } satisfies DatasetItem,
          ],
        })),
      suggest: (dataset, fields, targetId) =>
        update((d) => ({
          contributions: [
            {
              id: newId("c"),
              dataset,
              kind: targetId ? "edit" : "new",
              targetId: targetId ?? null,
              title: fields.name,
              detail: fields.detail,
              tags: fields.tags,
              submittedBy: me.id,
              submittedAt: nowIso,
              status: "pending",
              reviewedBy: null,
              reviewedAt: null,
              note: null,
            },
            ...d.contributions,
          ],
        })),
      peerCheck: (itemId, status) =>
        update((d) => ({
          items: d.items.map((it) =>
            it.id === itemId ? { ...it, peerCheck: { status, by: me.id, at: nowIso } } : it,
          ),
        })),
      apply: (dataset, motivation, snapshot) =>
        update((d) => ({
          applications: [
            {
              id: newId("a"),
              personId: me.id,
              dataset,
              motivation,
              submittedAt: nowIso,
              status: "pending",
              snapshot,
            },
            ...d.applications,
          ],
        })),
      subscribe: (plan, app) =>
        update((d) => {
          const current = d.api.subscriptions.find((s) => s.ownerId === me.id && !s.cancelledAt);
          const renewsAt = new Date(Date.parse(nowIso) + 30 * 86_400_000).toISOString();
          const subscriptions = current
            ? d.api.subscriptions.map((s) => (s.id === current.id ? { ...s, plan } : s))
            : [
                ...d.api.subscriptions,
                {
                  id: newId("s"),
                  ownerId: me.id,
                  ownerName: me.name,
                  app: app || "Untitled app",
                  plan,
                  startedAt: nowIso,
                  cancelledAt: null,
                  renewsAt,
                },
              ];
          return { api: { ...d.api, subscriptions } };
        }),
      cancelSubscription: () =>
        update((d) => ({
          api: {
            ...d.api,
            subscriptions: d.api.subscriptions.map((s) =>
              s.ownerId === me.id && !s.cancelledAt ? { ...s, cancelledAt: nowIso } : s,
            ),
            tokens: d.api.tokens.map((t) =>
              d.api.subscriptions.some((s) => s.id === t.subscriptionId && s.ownerId === me.id) &&
              !t.revokedAt
                ? { ...t, revokedAt: nowIso }
                : t,
            ),
          },
        })),
      createToken: (name) => {
        const secret = newTokenSecret();
        update((d) => {
          const sub = d.api.subscriptions.find((s) => s.ownerId === me.id && !s.cancelledAt);
          if (!sub) return {};
          const token: ApiToken = {
            id: newId("t"),
            subscriptionId: sub.id,
            name: name || "Untitled token",
            prefix: "ddk_live",
            last4: secret.slice(-4),
            createdAt: nowIso,
            lastUsedAt: null,
            revokedAt: null,
          };
          return { api: { ...d.api, tokens: [...d.api.tokens, token] } };
        });
        return secret;
      },
      revokeToken: (id) =>
        update((d) => ({
          api: {
            ...d.api,
            tokens: d.api.tokens.map((t) => (t.id === id ? { ...t, revokedAt: nowIso } : t)),
          },
        })),
      decideApplication: (id, status) =>
        update((d) => {
          const app = d.applications.find((a) => a.id === id);
          if (!app) return {};
          return {
            applications: d.applications.map((a) => (a.id === id ? { ...a, status } : a)),
            people:
              status === "approved"
                ? d.people.map((p) =>
                    p.id === app.personId && p.role === "contributor"
                      ? { ...p, role: "maintainer", maintains: [app.dataset] }
                      : p,
                  )
                : d.people,
          };
        }),
    };
  }, [data, role, setRole]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("useDashboard must be used inside <DashboardProvider>.");
  return value;
}
