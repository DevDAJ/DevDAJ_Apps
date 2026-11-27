import { expect, test } from "vite-plus/test";
import { ApiError } from "../../../shared/errors";
import { parseSyncRequest } from "./sync";

const UUID = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-01-02T03:04:05Z");
const STAMP = "2026-01-02T03:04:05Z";

const row = () => ({ entity: "recipe", rowId: UUID, data: { title: "Soup" }, updatedAt: STAMP });

function rejects(body: unknown): void {
  try {
    parseSyncRequest(body, NOW);
    throw new Error("Expected parseSyncRequest to reject.");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
  }
}

test("valid request normalizes row times", () => {
  expect(
    parseSyncRequest(
      {
        cursor: 12,
        rows: [
          {
            ...row(),
            entity: "pantry_item",
            deleted: true,
            updatedAt: "2026-01-02T03:04:05+00:00",
          },
        ],
      },
      NOW,
    ),
  ).toEqual({
    cursor: 12,
    rows: [
      {
        entity: "pantry_item",
        rowId: UUID,
        data: { title: "Soup" },
        deleted: true,
        updatedAt: "2026-01-02T03:04:05.000Z",
      },
    ],
  });
});

test("defaults cursor, rows and deleted", () => {
  expect(parseSyncRequest({}, NOW)).toEqual({ cursor: 0, rows: [] });
  expect(parseSyncRequest({ rows: [row()] }, NOW)).toEqual({
    cursor: 0,
    rows: [{ ...row(), deleted: false, updatedAt: "2026-01-02T03:04:05.000Z" }],
  });
});

test("accepts a row exactly five minutes in the future", () => {
  const updatedAt = new Date(NOW + 5 * 60_000).toISOString();
  expect(parseSyncRequest({ rows: [{ ...row(), updatedAt }] }, NOW).rows[0].updatedAt).toBe(
    updatedAt,
  );
});

test("dedupes by entity and rowId, keeping the latest update and first-seen order", () => {
  const second = "22222222-2222-4222-8222-222222222222";
  const third = "33333333-3333-4333-8333-333333333333";
  const stamp = (offset: number) => new Date(NOW + offset).toISOString();
  const body = {
    rows: [
      { entity: "recipe", rowId: UUID, data: { v: 1 }, updatedAt: stamp(0) },
      { entity: "pantry_item", rowId: second, data: { v: 1 }, updatedAt: stamp(1_000) },
      { entity: "recipe", rowId: UUID, data: { v: 3 }, updatedAt: stamp(2_000) },
      { entity: "pantry_item", rowId: second, data: { v: 2 }, updatedAt: stamp(1_000) },
      { entity: "grocery_list", rowId: third, data: { v: 4 }, updatedAt: stamp(0) },
      { entity: "recipe", rowId: UUID, data: { v: 0 }, updatedAt: stamp(-1_000) },
    ],
  };

  expect(parseSyncRequest(body, NOW).rows).toEqual([
    { entity: "recipe", rowId: UUID, data: { v: 3 }, deleted: false, updatedAt: stamp(2_000) },
    {
      entity: "pantry_item",
      rowId: second,
      data: { v: 2 },
      deleted: false,
      updatedAt: stamp(1_000),
    },
    { entity: "grocery_list", rowId: third, data: { v: 4 }, deleted: false, updatedAt: stamp(0) },
  ]);
});

test.each([
  ["null body", null],
  ["array body", []],
  ["string body", "nope"],
  ["negative cursor", { cursor: -1 }],
  ["fractional cursor", { cursor: 1.5 }],
  ["unsafe cursor", { cursor: Number.MAX_SAFE_INTEGER + 1 }],
  ["string cursor", { cursor: "0" }],
  ["null cursor", { cursor: null }],
  ["string rows", { rows: "nope" }],
  ["object rows", { rows: {} }],
  ["null rows", { rows: null }],
  ["too many rows", { rows: Array.from({ length: 201 }, row) }],
  ["row not an object", { rows: ["nope"] }],
  ["unknown entity", { rows: [{ ...row(), entity: "user" }] }],
  ["non-string entity", { rows: [{ ...row(), entity: 3 }] }],
  ["bad row ID", { rows: [{ ...row(), rowId: "nope" }] }],
  ["array data", { rows: [{ ...row(), data: [] }] }],
  ["string data", { rows: [{ ...row(), data: "nope" }] }],
  ["null data", { rows: [{ ...row(), data: null }] }],
  ["date data", { rows: [{ ...row(), data: new Date() }] }],
  ["oversized data", { rows: [{ ...row(), data: { pad: "x".repeat(20_001) } }] }],
  ["string deleted", { rows: [{ ...row(), deleted: "true" }] }],
  ["number deleted", { rows: [{ ...row(), deleted: 1 }] }],
  ["null deleted", { rows: [{ ...row(), deleted: null }] }],
  ["unparseable time", { rows: [{ ...row(), updatedAt: "nope" }] }],
  ["non-string time", { rows: [{ ...row(), updatedAt: NOW }] }],
  ["future time", { rows: [{ ...row(), updatedAt: new Date(NOW + 300_001).toISOString() }] }],
])("rejects %s", (_name, body) => {
  rejects(body);
});
