/**
 * Illustrative preview data for the dashboard (seeded, so every load looks the same).
 * Nothing here comes from the database; replace `createMockData` with API calls when the
 * dashboard design is settled.
 */
import { createMockApiData } from "./api";
import type {
  Contribution,
  ContributionStatus,
  DashboardData,
  DatasetId,
  DatasetInfo,
  DatasetItem,
  MaintainerApplication,
  Person,
} from "./types";

export const DATASETS: DatasetInfo[] = [
  { id: "gyms", name: "Gyms", app: "Fitnexx", noun: "gym", series: 1 },
  { id: "exercises", name: "Exercises", app: "Fitnexx", noun: "exercise", series: 2 },
  { id: "merchants", name: "Merchants", app: "Finance Tracker", noun: "merchant", series: 3 },
  { id: "foods", name: "Foods", app: "Pantry Helper", noun: "food", series: 4 },
];

/** Who each role previews as. */
export const PERSONAS = { admin: "p-admin", maintainer: "p-m1", contributor: "p-c1" } as const;

const DAY = 86_400_000;
const HISTORY_DAYS = 120;

/** mulberry32: small, fast, seeded. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES: Record<DatasetId, { names: string[]; details: string[]; tags: string[] }> = {
  gyms: {
    names: [
      "Iron Den",
      "Kettlebell Club",
      "Northside Strength",
      "Riverside Fitness",
      "The Barbell Room",
      "Peak Performance",
      "Community Rec Centre",
      "Lift Lab",
      "Harbour Gym",
      "Studio 24",
      "Forge Athletics",
      "Old Mill Boxing",
    ],
    details: ["Bangsar", "Petaling Jaya", "Subang", "Cheras", "Mont Kiara", "Shah Alam", "Ampang"],
    tags: ["Squat rack", "Cable machine", "Dumbbells to 50kg", "Leg press", "Rower", "Sled"],
  },
  exercises: {
    names: [
      "Bulgarian split squat",
      "Cable fly",
      "Landmine press",
      "Chest-supported row",
      "Nordic curl",
      "Pallof press",
      "Sissy squat",
      "Meadows row",
      "Z press",
      "Copenhagen plank",
    ],
    details: ["Legs", "Chest", "Shoulders", "Back", "Hamstrings", "Core"],
    tags: ["Dumbbell", "Cable", "Barbell", "Bodyweight", "Machine"],
  },
  merchants: {
    names: [
      "Corner Grocer",
      "Night Market Stall",
      "Metro Pharmacy",
      "Kopi House",
      "Hardware Depot",
      "Book Nook",
      "Fuel Station",
      "Noodle Bar",
    ],
    details: ["Groceries", "Dining", "Health", "Transport", "Home", "Leisure"],
    tags: ["Card", "Cash", "QR pay", "E-wallet"],
  },
  foods: {
    names: [
      "Brown rice",
      "Tempeh",
      "Greek yoghurt",
      "Rolled oats",
      "Chicken thigh",
      "Kangkung",
      "Red lentils",
      "Tofu puff",
      "Sweet potato",
      "Ikan bilis",
    ],
    details: ["Grains", "Protein", "Dairy", "Vegetables", "Legumes", "Snacks"],
    tags: ["Per 100 g", "Per serving", "Verified label", "Home measured"],
  },
};

const PEOPLE: Omit<Person, "joinedAt">[] = [
  { id: "p-admin", name: "You (admin)", role: "admin", maintains: [] },
  { id: "p-m1", name: "Mei Lin", role: "maintainer", maintains: ["gyms"] },
  { id: "p-m2", name: "Aiman R.", role: "maintainer", maintains: ["gyms", "exercises"] },
  { id: "p-m3", name: "Farah K.", role: "maintainer", maintains: ["exercises"] },
  { id: "p-m4", name: "Jonas P.", role: "maintainer", maintains: ["merchants"] },
  { id: "p-m5", name: "Priya S.", role: "maintainer", maintains: ["foods"] },
  ...[
    "Hafiz N.",
    "Sara T.",
    "Wei Jie",
    "Nadia A.",
    "Tom B.",
    "Aisyah Z.",
    "Kumar V.",
    "Lena M.",
    "Ravi P.",
    "Chloe D.",
    "Daniel O.",
    "Yuki H.",
    "Imran S.",
    "Grace L.",
    "Arif M.",
    "Hana K.",
    "Marco F.",
    "Siti R.",
    "Ben C.",
    "Zara Q.",
    "Elif Y.",
    "Omar J.",
  ].map(
    (name, i) =>
      ({ id: `p-c${i + 2}`, name, role: "contributor", maintains: [] }) as Omit<Person, "joinedAt">,
  ),
  { id: "p-c1", name: "You (contributor)", role: "contributor", maintains: [] },
];

/** Spam/unreliable chance per contributor; a few are noisy. */
const NOISY: Record<string, number> = { "p-c5": 0.35, "p-c9": 0.22, "p-c14": 0.15, "p-c20": 0.5 };

function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)];
}

function weighted<T>(rand: () => number, entries: [T, number][]): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rand() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function tagsFor(rand: () => number, dataset: DatasetId): string[] {
  const pool = NAMES[dataset].tags;
  return pool.filter(() => rand() < 0.4).slice(0, 4);
}

function itemName(rand: () => number, dataset: DatasetId): string {
  const base = pick(rand, NAMES[dataset].names);
  return dataset === "gyms" ? `${base} ${pick(rand, NAMES.gyms.details)}` : base;
}

export function createMockData(now = new Date()): DashboardData {
  const rand = rng(20261120);
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const t0 = today.getTime() - HISTORY_DAYS * DAY;
  const at = (dayOffset: number, hour: number) =>
    new Date(t0 + dayOffset * DAY + (hour - 12) * 3_600_000).toISOString();

  const people: Person[] = PEOPLE.map((p, i) => ({
    ...p,
    joinedAt: new Date(t0 - (200 - i * 4) * DAY).toISOString(),
  }));
  const maintainersOf = (dataset: DatasetId) =>
    people.filter((p) => p.role === "maintainer" && p.maintains.includes(dataset));
  const contributors = people.filter((p) => p.role === "contributor" && p.id !== "p-c1");

  // ---- Seed items that existed before the history window ---------------------
  const items: DatasetItem[] = [];
  let itemSeq = 0;
  const seedCounts: Record<DatasetId, number> = {
    gyms: 140,
    exercises: 210,
    merchants: 60,
    foods: 95,
  };
  for (const ds of DATASETS) {
    for (let i = 0; i < seedCounts[ds.id]; i++) {
      const added = new Date(t0 - Math.floor(rand() * 300) * DAY).toISOString();
      items.push({
        id: `i-${++itemSeq}`,
        dataset: ds.id,
        name: itemName(rand, ds.id),
        detail: pick(rand, NAMES[ds.id].details),
        tags: tagsFor(rand, ds.id),
        addedBy: pick(rand, maintainersOf(ds.id)).id,
        addedAt: added,
        updatedAt: added,
        peerCheck: { status: "confirmed" },
      });
    }
  }

  // ---- Contributions over the history window ---------------------------------
  const contributions: Contribution[] = [];
  let cSeq = 0;
  const contributorWeights: [Person, number][] = contributors.map((p, i) => [p, 1 / (i + 1.2)]);
  const hourWeights: [number, number][] = Array.from({ length: 24 }, (_, h) => [
    h,
    h < 7 ? 0.2 : h < 12 ? 0.8 : h < 18 ? 1 : h < 23 ? 1.8 : 0.6,
  ]);

  const addContribution = (person: Person, day: number, forced?: ContributionStatus) => {
    const dataset = weighted<DatasetId>(rand, [
      ["gyms", 0.45],
      ["exercises", 0.25],
      ["foods", 0.2],
      ["merchants", 0.1],
    ]);
    const weekday = new Date(t0 + day * DAY).getDay();
    const hour = weighted(rand, hourWeights);
    const submittedAt = at(day, weekday === 0 || weekday === 6 ? Math.max(hour, 9) : hour);
    const age = HISTORY_DAYS - day;
    const noisy = NOISY[person.id] ?? 0.03;
    const edit = rand() < 0.35;
    const existing = edit
      ? pick(
          rand,
          items.filter((it) => it.dataset === dataset),
        )
      : null;
    let status: ContributionStatus =
      forced ??
      (age < 2 && rand() < 0.85
        ? "pending"
        : age < 6 && rand() < 0.4
          ? "pending"
          : age < 14 && rand() < 0.05
            ? "pending"
            : rand() < noisy
              ? rand() < 0.6
                ? "spam"
                : "unreliable"
              : rand() < 0.16
                ? "rejected"
                : "approved");
    if (age < 0) status = "pending";
    const reviewer = status === "pending" ? null : pick(rand, maintainersOf(dataset));
    const reviewHours = 2 + rand() ** 2 * 90 * (reviewer?.id === "p-m4" ? 1.8 : 1);
    const reviewedAt =
      status === "pending"
        ? null
        : new Date(
            Math.max(
              Date.parse(submittedAt) + 3_600_000,
              Math.min(
                Date.parse(submittedAt) + reviewHours * 3_600_000,
                today.getTime() - (1 + rand() * 6) * 3_600_000,
              ),
            ),
          ).toISOString();
    const c: Contribution = {
      id: `c-${++cSeq}`,
      dataset,
      kind: edit ? "edit" : "new",
      targetId: existing?.id ?? null,
      title: existing?.name ?? itemName(rand, dataset),
      detail: pick(rand, NAMES[dataset].details),
      tags: tagsFor(rand, dataset),
      submittedBy: person.id,
      submittedAt,
      status,
      reviewedBy: reviewer?.id ?? null,
      reviewedAt,
      note:
        status === "spam"
          ? "Duplicate of an existing entry with promotional text."
          : status === "unreliable"
            ? "Location does not match the address."
            : status === "rejected"
              ? "Already listed; merged instead."
              : null,
    };
    contributions.push(c);
    if (status === "approved" && reviewedAt) {
      if (existing) existing.updatedAt = reviewedAt;
      else
        items.push({
          id: `i-${++itemSeq}`,
          dataset,
          name: c.title,
          detail: c.detail,
          tags: c.tags,
          addedBy: person.id,
          addedAt: reviewedAt,
          updatedAt: reviewedAt,
          peerCheck: null,
        });
    }
  };

  for (let day = 0; day <= HISTORY_DAYS; day++) {
    const weekday = new Date(t0 + day * DAY).getDay();
    const trend = 4 + (day / HISTORY_DAYS) * 9;
    const weekend = weekday === 0 || weekday === 6 ? 1.35 : 1;
    const count = Math.round(trend * weekend * (0.6 + rand() * 0.8));
    for (let k = 0; k < count; k++) addContribution(weighted(rand, contributorWeights), day);

    // Maintainers add items directly; other maintainers can check them.
    if (rand() < 0.45) {
      const maintainer = pick(
        rand,
        people.filter((p) => p.role === "maintainer"),
      );
      const dataset = pick(rand, maintainer.maintains);
      const peers = people.filter((p) => p.role === "maintainer" && p.id !== maintainer.id);
      const age = HISTORY_DAYS - day;
      const added = at(day, 10 + Math.floor(rand() * 8));
      const checked = age > 9 || rand() < 0.3;
      items.push({
        id: `i-${++itemSeq}`,
        dataset,
        name: itemName(rand, dataset),
        detail: pick(rand, NAMES[dataset].details),
        tags: tagsFor(rand, dataset),
        addedBy: maintainer.id,
        addedAt: added,
        updatedAt: added,
        peerCheck: checked
          ? {
              status: rand() < 0.9 ? "confirmed" : "flagged",
              by: pick(rand, peers).id,
              at: new Date(Date.parse(added) + (6 + rand() * 60) * 3_600_000).toISOString(),
            }
          : { status: "awaiting" },
      });
    }
  }

  // The previewed contributor: close to the bar (17 of 20 this month, one spam flag).
  const you = people.find((p) => p.id === "p-c1")!;
  for (let k = 0; k < 9; k++) addContribution(you, 40 + k * 6, "approved");
  for (let k = 0; k < 17; k++) {
    const day = HISTORY_DAYS - 28 + Math.floor((k * 28) / 17);
    addContribution(
      you,
      day,
      k === 3 ? "spam" : k === 9 ? "rejected" : k > 14 ? "pending" : "approved",
    );
  }

  contributions.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const applications: MaintainerApplication[] = [
    {
      id: "a-1",
      personId: "p-c2",
      dataset: "gyms",
      motivation:
        "I train at six gyms around PJ and keep their equipment lists up to date already.",
      submittedAt: at(HISTORY_DAYS - 2, 21),
      status: "pending",
      snapshot: { contributionsInWindow: 31, flaggedRate: 0.02 },
    },
    {
      id: "a-2",
      personId: "p-c3",
      dataset: "foods",
      motivation: "Nutrition student; I can verify labels against the packaging.",
      submittedAt: at(HISTORY_DAYS - 5, 19),
      status: "pending",
      snapshot: { contributionsInWindow: 22, flaggedRate: 0.07 },
    },
    {
      id: "a-3",
      personId: "p-m3",
      dataset: "exercises",
      motivation: "Coach, happy to own the exercise library.",
      submittedAt: at(30, 18),
      status: "approved",
      snapshot: { contributionsInWindow: 26, flaggedRate: 0.04 },
    },
    {
      id: "a-4",
      personId: "p-c5",
      dataset: "gyms",
      motivation: "Want to add my gym's branches.",
      submittedAt: at(70, 13),
      status: "declined",
      snapshot: { contributionsInWindow: 21, flaggedRate: 0.09 },
    },
  ];

  return {
    api: createMockApiData(today, PERSONAS.maintainer),
    now: today.toISOString(),
    datasets: DATASETS,
    people,
    items,
    contributions,
    applications,
  };
}
