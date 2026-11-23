import { type Contribution, FLAGGED } from "./types";

/** Contributions needed inside the window before someone can apply to maintain a dataset. */
export const MIN_CONTRIBUTIONS = 20;
/** "One month": a rolling window ending today. */
export const WINDOW_DAYS = 30;
/** Highest share of reviewed contributions that may be marked spam or unreliable. */
export const MAX_FLAGGED_RATE = 0.1;

const DAY = 86_400_000;

export interface Eligibility {
  /** Contributions submitted in the last WINDOW_DAYS (any status). */
  inWindow: number;
  /** Reviewed contributions, all time. */
  reviewed: number;
  flagged: number;
  /** flagged / reviewed; 0 with nothing reviewed. */
  flaggedRate: number;
  enoughContributions: boolean;
  reliable: boolean;
  eligible: boolean;
}

/** Whether a contributor may apply to become a maintainer, from their own contributions. */
export function maintainerEligibility(mine: Contribution[], now: Date): Eligibility {
  const since = now.getTime() - WINDOW_DAYS * DAY;
  const inWindow = mine.filter((c) => {
    const at = Date.parse(c.submittedAt);
    return at > since && at <= now.getTime();
  }).length;
  const reviewed = mine.filter((c) => c.status !== "pending").length;
  const flagged = mine.filter((c) => FLAGGED.includes(c.status)).length;
  const flaggedRate = reviewed ? flagged / reviewed : 0;
  const enoughContributions = inWindow >= MIN_CONTRIBUTIONS;
  const reliable = flaggedRate <= MAX_FLAGGED_RATE;
  return {
    inWindow,
    reviewed,
    flagged,
    flaggedRate,
    enoughContributions,
    reliable,
    eligible: enoughContributions && reliable,
  };
}
