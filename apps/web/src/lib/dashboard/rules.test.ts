import { describe, expect, test } from "vite-plus/test";
import { maintainerEligibility } from "./rules";
import type { Contribution, ContributionStatus } from "./types";

const NOW = new Date("2026-11-20T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function make(count: number, status: ContributionStatus, ageDays = 1): Contribution[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${status}-${ageDays}-${i}`,
    dataset: "gyms",
    kind: "new",
    targetId: null,
    title: "x",
    detail: "",
    tags: [],
    submittedBy: "p",
    submittedAt: daysAgo(ageDays),
    status,
    reviewedBy: null,
    reviewedAt: null,
    note: null,
  }));
}

describe("maintainerEligibility", () => {
  test("20 in the last 30 days with no flags is eligible", () => {
    const result = maintainerEligibility(make(20, "approved"), NOW);
    expect(result).toMatchObject({ inWindow: 20, flaggedRate: 0, eligible: true });
  });

  test("19 is not enough, and older contributions do not count toward the window", () => {
    const result = maintainerEligibility(
      [...make(19, "approved"), ...make(10, "approved", 31)],
      NOW,
    );
    expect(result.inWindow).toBe(19);
    expect(result.eligible).toBe(false);
  });

  test("exactly 10% flagged is allowed, above is not", () => {
    const ok = maintainerEligibility([...make(18, "approved"), ...make(2, "spam")], NOW);
    expect(ok.flaggedRate).toBe(0.1);
    expect(ok.eligible).toBe(true);
    const bad = maintainerEligibility(
      [...make(17, "approved"), ...make(2, "spam"), ...make(1, "unreliable")],
      NOW,
    );
    expect(bad.reliable).toBe(false);
    expect(bad.eligible).toBe(false);
  });

  test("plain rejections and pending items do not count as flagged", () => {
    const result = maintainerEligibility(
      [...make(10, "rejected"), ...make(5, "pending"), ...make(5, "approved")],
      NOW,
    );
    expect(result).toMatchObject({ reviewed: 15, flagged: 0, eligible: true });
  });
});
