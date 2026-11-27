import { describe, expect, test } from "vite-plus/test";
import { applyLocalChange, applySyncResponse, emptyState, rowKey, takePending } from "./syncCore";
import type { Entity, SyncRow } from "./types";

function row(
  entity: Entity,
  rowId: string,
  updatedAt: string,
  data: Record<string, unknown> = { name: "old" },
  deleted = false,
): SyncRow {
  return { entity, rowId, data, deleted, updatedAt };
}

describe("syncCore", () => {
  test("local changes update rows and queue them for push", () => {
    const first = row("recipe", "a", "2026-01-01T00:00:00.000Z", { title: "First" });
    const second = row("pantry_item", "b", "2026-01-02T00:00:00.000Z", { name: "Rice" });
    const state = applyLocalChange(applyLocalChange(emptyState(), first), second);

    expect(state.rows[rowKey("recipe", "a")]).toEqual(first);
    expect(state.pending[rowKey("pantry_item", "b")]).toEqual(second);
    expect(takePending(state)).toEqual([first, second]);
  });

  test("takePending respects the limit and oldest update first", () => {
    const older = row("recipe", "a", "2026-01-01T00:00:00.000Z");
    const newer = row("recipe", "b", "2026-02-01T00:00:00.000Z");
    const state = applyLocalChange(applyLocalChange(emptyState(), newer), older);

    expect(takePending(state, 1)).toEqual([older]);
    expect(takePending(state)).toEqual([older, newer]);
  });

  test("a pull applies remote rows and clears acknowledged pending rows", () => {
    const local = row("recipe", "a", "2026-01-01T00:00:00.000Z");
    const sent = [local];
    const state = applyLocalChange(emptyState(), local);
    const remote = row("recipe", "a", "2026-01-01T00:00:00.000Z", { title: "Remote" });

    const result = applySyncResponse(state, sent, {
      cursor: 7,
      rows: [remote, row("pantry_item", "b", "2026-01-01T00:00:00.000Z")],
    });

    expect(result.cursor).toBe(7);
    expect(result.pending).toEqual({});
    expect(result.rows[rowKey("recipe", "a")]).toEqual(remote);
    expect(result.rows[rowKey("pantry_item", "b")]).toBeDefined();
  });

  test("a newer local edit survives a stale pull", () => {
    const sent = row("recipe", "a", "2026-01-01T00:00:00.000Z");
    const edited = row("recipe", "a", "2026-03-01T00:00:00.000Z", { title: "Edited" });
    const state = applyLocalChange(applyLocalChange(emptyState(), sent), edited);
    const stale = row("recipe", "a", "2026-02-01T00:00:00.000Z", { title: "Stale" });

    const result = applySyncResponse(state, [sent], { cursor: 2, rows: [stale] });

    expect(result.pending[rowKey("recipe", "a")]).toEqual(edited);
    expect(result.rows[rowKey("recipe", "a")]).toEqual(edited);
  });

  test("an edit made during a request stays pending", () => {
    const sent = row("recipe", "a", "2026-01-01T00:00:00.000Z");
    const state = applyLocalChange(emptyState(), sent);
    const edited = row("recipe", "a", "2026-04-01T00:00:00.000Z", { title: "During request" });
    const withEdit = applyLocalChange(state, edited);

    const result = applySyncResponse(withEdit, [sent], {
      cursor: 3,
      rows: [row("recipe", "a", "2026-01-01T00:00:00.000Z", { title: "Acked" })],
    });

    expect(result.pending[rowKey("recipe", "a")]).toEqual(edited);
    expect(takePending(result)).toEqual([edited]);
    expect(result.rows[rowKey("recipe", "a")]).toEqual(edited);
  });

  test("keeps tombstones in rows so screens can filter them", () => {
    const deleted = row("grocery_item", "x", "2026-01-01T00:00:00.000Z", {}, true);
    const state = applyLocalChange(emptyState(), deleted);
    const result = applySyncResponse(state, [deleted], { cursor: 1, rows: [] });

    expect(result.rows[rowKey("grocery_item", "x")]).toEqual(deleted);
    expect(result.rows[rowKey("grocery_item", "x")].deleted).toBe(true);
    expect(result.pending).toEqual({});
  });

  test("does not overwrite a locally newer row when the pull omits it", () => {
    const local = row("pantry_item", "a", "2026-05-01T00:00:00.000Z");
    const state = applyLocalChange(emptyState(), local);
    const result = applySyncResponse(state, [], { cursor: 1, rows: [] });

    expect(result.rows[rowKey("pantry_item", "a")]).toEqual(local);
    expect(result.pending[rowKey("pantry_item", "a")]).toEqual(local);
  });
});
