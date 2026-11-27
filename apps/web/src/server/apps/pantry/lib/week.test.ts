import { expect, test } from "vite-plus/test";
import { weekStartUtc } from "./week";

test.each([
  ["2026-11-29T23:59:59Z", "2026-11-23T00:00:00.000Z"],
  ["2026-11-30T00:00:00Z", "2026-11-30T00:00:00.000Z"],
  ["2026-12-02T12:34:56Z", "2026-11-30T00:00:00.000Z"],
  ["2026-12-06T23:59:59Z", "2026-11-30T00:00:00.000Z"],
  ["2026-12-07T00:00:00Z", "2026-12-07T00:00:00.000Z"],
])("weekStartUtc(%s) is %s", (now, expected) => {
  expect(weekStartUtc(new Date(now)).toISOString()).toBe(expected);
});

test("resets seven days after the week starts", () => {
  const start = weekStartUtc(new Date("2026-12-31T12:00:00Z"));
  expect(new Date(start.getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString()).toBe(
    "2027-01-04T00:00:00.000Z",
  );
});
