/**
 * Every DevDAJ app. Shared by the landing pages (client) and the store metrics sync (server),
 * so it must stay free of server-only imports.
 */
export type AppStatus = "live" | "beta" | "coming_soon";

/** Line ink on the network map; one per app, never reused. */
export type LineColor = "scarlet" | "amber" | "green";

/** A connection between this app and the rest of the suite, shown as a transfer on its page. */
export interface Transfer {
  /** Another app's slug, "dataset" (global dataset) or "suite" (any DevDAJ app). */
  with: string;
  direction: "in" | "out";
  /** What travels, in plain words. */
  carries: string;
  /** "live" only when the shipped app does it today. */
  status: "live" | "planned";
}

export interface AppEntry {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  status: AppStatus;
  /** Reverse-DNS id, `tech.devdaj.app.<slug>` on both platforms (see packages/app-data). */
  bundleId: string;
  stores: {
    googlePlay?: { url: string };
    /** Numeric App Store id ("Apple Identifier" in Sales reports). */
    appStore?: { appleId: string; url: string };
  };
  /** Installable web app (PWA), same account as the phone app. */
  webApp?: { url: string };
  highlights: string[];
  line: LineColor;
  /** Short station names for the network map: what this line carries. */
  stops: string[];
  transfers: Transfer[];
}

const bundleId = (slug: string) => `tech.devdaj.app.${slug}`;

export const APPS: readonly AppEntry[] = [
  {
    slug: "fitnexx",
    name: "Fitnexx",
    tagline: "Fitness tracker that knows your gym.",
    description:
      "Log workouts and meals, see muscle-level progress, and get exercise suggestions that match the equipment at the gym you are standing in.",
    status: "beta",
    bundleId: bundleId("fitnexx"),
    stores: {
      googlePlay: { url: `https://play.google.com/store/apps/details?id=${bundleId("fitnexx")}` },
    },
    highlights: [
      "Workout and meal logging that works offline",
      "Muscle analysis, PRs, plateaus and injury-risk hints",
      "Exercise suggestions that match the equipment at your gym",
    ],
    line: "scarlet",
    stops: ["Workouts", "Meals", "Body & water"],
    transfers: [
      {
        with: "suite",
        direction: "out",
        carries: "Workouts, meals, body metrics and water, readable by your other DevDAJ apps",
        status: "live",
      },
      { with: "dataset", direction: "in", carries: "Gyms and their equipment", status: "planned" },
      {
        with: "pantry",
        direction: "in",
        carries: "Meals cooked from your pantry",
        status: "planned",
      },
    ],
  },
  {
    slug: "finance",
    name: "Finance Tracker",
    tagline: "Budgets and spending, kept on your phone.",
    description: "Track spending and budgets without handing your bank data to anyone.",
    status: "coming_soon",
    bundleId: bundleId("finance"),
    stores: {},
    highlights: ["Private by default", "Works with your other DevDAJ apps"],
    line: "amber",
    stops: ["Budgets", "Spending"],
    transfers: [],
  },
  {
    slug: "pantry",
    name: "Pantry Helper",
    tagline: "Recipes, pantry and groceries for the whole household.",
    description:
      "Save recipes from YouTube and TikTok captions or write your own, keep track of what is in the pantry, and turn tonight's recipes into a grocery list that skips what you already have. Everyone in the household sees the same lists.",
    status: "beta",
    bundleId: bundleId("pantry"),
    stores: {},
    webApp: { url: "/pantry/app/" },
    highlights: [
      "Save recipes from YouTube and TikTok captions, or write your own",
      "Pantry, spices and aromatics, cold storage and meats in one place",
      "Grocery lists from your recipes, minus what you already have",
      "One household, shared with everyone who cooks",
    ],
    line: "green",
    stops: ["Recipes", "Pantry", "Groceries"],
    transfers: [
      {
        with: "fitnexx",
        direction: "out",
        carries: "Meals cooked from your pantry",
        status: "planned",
      },
    ],
  },
];

export function findApp(slug: string): AppEntry | undefined {
  return APPS.find((app) => app.slug === slug);
}
