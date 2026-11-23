/**
 * Dashboard model. The pages only talk to these shapes, so the preview data in `mock.ts` can be
 * swapped for the platform API (`src/server/platform/dataset`) without touching the UI.
 */

import type { ApiData } from "./api";

export type Role = "admin" | "maintainer" | "contributor";

export type DatasetId = "gyms" | "exercises" | "merchants" | "foods";

export interface DatasetInfo {
  id: DatasetId;
  name: string;
  /** The app that reads it first. */
  app: string;
  /** What one item is called ("gym", "exercise"). */
  noun: string;
  /** Chart series slot (fixed per dataset, never by rank). */
  series: 1 | 2 | 3 | 4;
}

export interface Person {
  id: string;
  name: string;
  role: Role;
  /** Datasets a maintainer is responsible for. */
  maintains: DatasetId[];
  joinedAt: string;
}

export interface DatasetItem {
  id: string;
  dataset: DatasetId;
  name: string;
  /** Short secondary line (address, muscle group, category). */
  detail: string;
  tags: string[];
  addedBy: string;
  addedAt: string;
  updatedAt: string;
  /**
   * Items a maintainer added go live at once; another maintainer can still check them.
   * `null` for items that came in through an approved contribution (already reviewed).
   */
  peerCheck: null | { status: "awaiting" | "confirmed" | "flagged"; by?: string; at?: string };
}

/**
 * Outcome of a contributor's request. `spam` and `unreliable` count against the contributor's
 * maintainer eligibility; a plain `rejected` does not.
 */
export type ContributionStatus = "pending" | "approved" | "rejected" | "spam" | "unreliable";

export const FLAGGED: readonly ContributionStatus[] = ["spam", "unreliable"];

export interface Contribution {
  id: string;
  dataset: DatasetId;
  kind: "new" | "edit";
  /** For edits: the item being changed. */
  targetId: string | null;
  title: string;
  detail: string;
  tags: string[];
  submittedBy: string;
  submittedAt: string;
  status: ContributionStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  note: string | null;
}

export interface MaintainerApplication {
  id: string;
  personId: string;
  dataset: DatasetId;
  motivation: string;
  submittedAt: string;
  status: "pending" | "approved" | "declined";
  /** Eligibility numbers frozen at submission, shown to the admin. */
  snapshot: { contributionsInWindow: number; flaggedRate: number };
}

export interface DashboardData {
  /** Paid API access to the dataset (see api.ts). */
  api: ApiData;
  now: string;
  datasets: DatasetInfo[];
  people: Person[];
  items: DatasetItem[];
  contributions: Contribution[];
  applications: MaintainerApplication[];
}
