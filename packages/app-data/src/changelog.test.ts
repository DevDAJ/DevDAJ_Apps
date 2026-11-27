import { describe, expect, test } from "vite-plus/test";
import {
  applyOps,
  compareHlc,
  decodeHlc,
  emptyState,
  encodeHlc,
  hlcReceive,
  hlcTick,
  materialize,
  materializeTable,
  parseOperation,
  rowKey,
  type Operation,
} from "./changelog";

const deviceA = "dev_a";
const deviceB = "dev_b";

function hlc(wall: number, counter = 0, device = deviceA): string {
  return encodeHlc({ wall, counter, device });
}

function op(value: Record<string, unknown>): Operation {
  return parseOperation(value);
}

function sortedEntries<T>(map: Map<string, T>): Array<[string, T]> {
  return [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const current = copy[i];
    copy[i] = copy[j];
    copy[j] = current;
  }
  return copy;
}

describe("hybrid logical clock", () => {
  test("tick increments the counter at the same time and when the clock goes backwards", () => {
    const first = hlcTick(null, 1000, deviceA);
    expect(first).toEqual({ wall: 1000, counter: 0, device: deviceA });
    const second = hlcTick(first, 1000, deviceA);
    expect(second).toEqual({ wall: 1000, counter: 1, device: deviceA });
    const third = hlcTick(second, 900, deviceA);
    expect(third).toEqual({ wall: 1000, counter: 2, device: deviceA });
    expect(hlcTick(third, 1001, deviceA).counter).toBe(0);
  });

  test("receive takes the remote wall when ahead and moves past both inputs", () => {
    const local = { wall: 100, counter: 2, device: deviceA };
    const remote = { wall: 5000, counter: 7, device: deviceB };
    const joined = hlcReceive(local, remote, 50);
    expect(joined).toEqual({ wall: 5000, counter: 8, device: deviceA });
    expect(compareHlc(encodeHlc(joined), encodeHlc(local))).toBe(1);
    expect(compareHlc(encodeHlc(joined), encodeHlc(remote))).toBe(1);

    const tied = hlcReceive(
      { wall: 100, counter: 4, device: deviceA },
      { wall: 100, counter: 9, device: deviceB },
      90,
    );
    expect(tied).toEqual({ wall: 100, counter: 10, device: deviceA });
  });

  test("encoding round trips and sorts by causal order", () => {
    const clocks = [
      { wall: 1, counter: 0, device: "a" },
      { wall: 1, counter: 1, device: "a" },
      { wall: 1, counter: 1, device: "b" },
      { wall: 2, counter: 0, device: "a" },
    ];
    const encoded = clocks.map(encodeHlc);
    expect(encoded).toEqual([
      "000000000000001-0000-a",
      "000000000000001-0001-a",
      "000000000000001-0001-b",
      "000000000000002-0000-a",
    ]);
    expect(encoded.map(decodeHlc)).toEqual(clocks);
    for (let i = 1; i < encoded.length; i++) {
      expect(compareHlc(encoded[i - 1], encoded[i])).toBe(-1);
    }
    expect(compareHlc(encoded[0], encoded[0])).toBe(0);
  });

  test("rejects malformed clocks and counter overflow", () => {
    for (const bad of [
      "",
      "000000000000001-000-a",
      "000000000000001-00!0-a",
      "000000000000001-0000-A!",
      "000000000000001-0000-a-b",
      "000000000000001-0000-",
      "0000000000000001-0000-a",
    ]) {
      expect(() => decodeHlc(bad)).toThrow("Invalid HLC");
    }
    expect(() => hlcTick({ wall: 1, counter: 36 ** 4 - 1, device: deviceA }, 1, deviceA)).toThrow(
      "HLC counter overflow",
    );
    expect(() =>
      hlcReceive(
        { wall: 1, counter: 36 ** 4 - 1, device: deviceA },
        { wall: 1, counter: 0, device: deviceB },
        0,
      ),
    ).toThrow("HLC counter overflow");
    expect(() => hlcTick(null, -1, deviceA)).toThrow("Invalid HLC time");
    expect(() => hlcTick(null, Number.NaN, deviceA)).toThrow("Invalid HLC time");
    expect(() => hlcTick(null, 1, "bad-device")).toThrow("Invalid HLC device");
  });
});

describe("parseOperation", () => {
  const base = { id: "op1", hlc: hlc(1), app: "fitnexx" };

  test("accepts every kind and strips unknown keys", () => {
    expect(
      parseOperation({
        ...base,
        table: "meals",
        row: "r1",
        kind: "set",
        fields: { name: "x", count: 2, note: null },
        leaked: "no",
      }),
    ).toEqual({
      ...base,
      table: "meals",
      row: "r1",
      kind: "set",
      fields: { name: "x", count: 2, note: null },
    });
    expect(
      parseOperation({
        ...base,
        table: "meals",
        row: "r1",
        kind: "increment",
        field: "count",
        by: -1,
        leaked: "no",
      }),
    ).toEqual({
      ...base,
      table: "meals",
      row: "r1",
      kind: "increment",
      field: "count",
      by: -1,
    });
    expect(
      parseOperation({ ...base, table: "meals", row: "r1", kind: "delete", leaked: "no" }),
    ).toEqual({ ...base, table: "meals", row: "r1", kind: "delete" });
    expect(parseOperation({ ...base, kind: "purge_app", leaked: "no" })).toEqual({
      ...base,
      kind: "purge_app",
    });
  });

  test("rejects untrusted operations", () => {
    const set = { table: "meals", row: "r1", kind: "set", fields: { count: 1 } };
    const increment = { table: "meals", row: "r1", kind: "increment", field: "count", by: 1 };
    const cases: Array<[string, unknown]> = [
      ["bad app name", { ...base, app: "Fitnexx", ...set }],
      ["bad table identifier", { ...base, table: "bad-table", row: "r1", kind: "delete" }],
      [
        "bad field identifier",
        { ...base, table: "meals", row: "r1", kind: "set", fields: { Bad: 1 } },
      ],
      ["empty fields", { ...base, table: "meals", row: "r1", kind: "set", fields: {} }],
      [
        "bad field value",
        { ...base, table: "meals", row: "r1", kind: "set", fields: { v: Number.NaN } },
      ],
      [
        "bad field value",
        { ...base, table: "meals", row: "r1", kind: "set", fields: { v: Infinity } },
      ],
      ["bad increment field", { ...base, ...increment, field: "1count" }],
      ["bad increment by", { ...base, ...increment, by: 0 }],
      ["bad increment by", { ...base, ...increment, by: Number.NaN }],
      ["bad increment by", { ...base, ...increment, by: Infinity }],
      ["bad hlc", { ...base, hlc: "nope", ...set }],
      ["missing id", { hlc: hlc(1), app: "fitnexx", ...set }],
      ["missing row", { ...base, table: "meals", kind: "delete" }],
      ["unknown kind", { ...base, kind: "nope" }],
      ["expected an object", null],
    ];
    for (const [reason, value] of cases) {
      expect(() => parseOperation(value)).toThrow(`Invalid operation: ${reason}`);
    }
  });
});

describe("merge rules", () => {
  const app = "fitnexx";
  const table = "counters";
  const row = "r1";

  test("concurrent writes to different fields survive; same field is last writer wins", () => {
    const setA = op({
      id: "a",
      hlc: hlc(100, 0, deviceA),
      app,
      table,
      row,
      kind: "set",
      fields: { name: "a" },
    });
    const setB = op({
      id: "b",
      hlc: hlc(100, 0, deviceB),
      app,
      table,
      row,
      kind: "set",
      fields: { count: 20 },
    });
    expect(materialize(applyOps(emptyState(), [setA, setB]), app, table, row)).toEqual({
      name: "a",
      count: 20,
    });

    const older = op({
      id: "old",
      hlc: hlc(100, 0, deviceA),
      app,
      table,
      row,
      kind: "set",
      fields: { name: "old" },
    });
    const newer = op({
      id: "new",
      hlc: hlc(100, 0, deviceB),
      app,
      table,
      row,
      kind: "set",
      fields: { name: "new" },
    });
    expect(materialize(applyOps(emptyState(), [older, newer]), app, table, row)).toEqual({
      name: "new",
    });
    expect(materialize(applyOps(emptyState(), [newer, older]), app, table, row)).toEqual({
      name: "new",
    });
  });

  test("identical hlc ties resolve by op id in either input order", () => {
    const first = op({
      id: "a",
      hlc: hlc(100, 0, deviceA),
      app,
      table,
      row,
      kind: "set",
      fields: { name: "first" },
    });
    const second = op({
      id: "b",
      hlc: hlc(100, 0, deviceA),
      app,
      table,
      row,
      kind: "set",
      fields: { name: "second" },
    });
    const together = materialize(applyOps(emptyState(), [first, second]), app, table, row);
    expect(together).toEqual({ name: "second" });
    expect(materialize(applyOps(emptyState(), [second, first]), app, table, row)).toEqual(together);
    expect(
      materialize(applyOps(applyOps(emptyState(), [first]), [second]), app, table, row),
    ).toEqual(together);
    expect(
      materialize(applyOps(applyOps(emptyState(), [second]), [first]), app, table, row),
    ).toEqual(together);
  });

  test("mixed batches merge identically across random permutations and reverse order", () => {
    const ops = [
      op({
        id: "set-1",
        hlc: hlc(100, 0, deviceA),
        app,
        table,
        row,
        kind: "set",
        fields: { count: 10, name: "old" },
      }),
      op({
        id: "inc-1",
        hlc: hlc(110, 0, deviceA),
        app,
        table,
        row,
        kind: "increment",
        field: "count",
        by: 2,
      }),
      op({
        id: "inc-2",
        hlc: hlc(120, 0, deviceB),
        app,
        table,
        row,
        kind: "increment",
        field: "count",
        by: -1,
      }),
      op({ id: "del-1", hlc: hlc(200, 0, deviceA), app, table, row, kind: "delete" }),
      op({
        id: "set-2",
        hlc: hlc(300, 0, deviceB),
        app,
        table,
        row,
        kind: "set",
        fields: { count: 5, name: "new" },
      }),
      op({
        id: "inc-3",
        hlc: hlc(310, 0, deviceA),
        app,
        table,
        row,
        kind: "increment",
        field: "count",
        by: -1,
      }),
      op({
        id: "set-3",
        hlc: hlc(320, 0, deviceB),
        app,
        table,
        row,
        kind: "set",
        fields: { note: "kept" },
      }),
      op({
        id: "purge-1",
        hlc: hlc(250, 0, deviceA),
        app: "other",
        kind: "purge_app",
      }),
      op({
        id: "set-4",
        hlc: hlc(150, 0, deviceB),
        app,
        table,
        row: "r2",
        kind: "set",
        fields: { count: 7 },
      }),
    ];

    const expected = materializeTable(applyOps(emptyState(), ops), app, table);
    expect(expected.get(row)).toEqual({ count: 4, name: "new", note: "kept" });
    expect(expected.get("r2")).toEqual({ count: 7 });
    expect(
      sortedEntries(materializeTable(applyOps(emptyState(), [...ops].reverse()), app, table)),
    ).toEqual(sortedEntries(expected));
    for (let seed = 1; seed <= 25; seed++) {
      const actual = materializeTable(applyOps(emptyState(), shuffled(ops, seed)), app, table);
      expect(sortedEntries(actual)).toEqual(sortedEntries(expected));
    }
  });

  test("applying a batch twice changes nothing and the input state is untouched", () => {
    const initial = applyOps(emptyState(), [
      op({
        id: "s",
        hlc: hlc(100, 0, deviceA),
        app,
        table,
        row,
        kind: "set",
        fields: { count: 10 },
      }),
    ]);
    const key = rowKey(app, table, row);
    const seenBefore = [...initial.seen];
    const valuesBefore = materialize(initial, app, table, row);
    const deletedBefore = initial.rows.get(key)?.deletedAt;

    const batch = [
      op({
        id: "i",
        hlc: hlc(110, 0, deviceA),
        app,
        table,
        row,
        kind: "increment",
        field: "count",
        by: 3,
      }),
      op({ id: "d", hlc: hlc(200, 0, deviceA), app, table, row, kind: "delete" }),
      op({ id: "p", hlc: hlc(210, 0, deviceA), app: "other", kind: "purge_app" }),
    ];
    const once = applyOps(initial, batch);
    const twice = applyOps(once, batch);

    expect(twice).toEqual(once);
    expect([...initial.seen]).toEqual(seenBefore);
    expect(materialize(initial, app, table, row)).toEqual(valuesBefore);
    expect(initial.rows.get(key)?.deletedAt).toBe(deletedBefore);
    expect(initial.purgedAt.size).toBe(0);
    expect(once.rows.get(key)?.deletedAt).not.toBeNull();
    expect(applyOps(once, [])).not.toBe(once);
  });

  test("increments from two devices add to a set counter", () => {
    const ops = [
      op({
        id: "s",
        hlc: hlc(100, 0, deviceA),
        app,
        table,
        row,
        kind: "set",
        fields: { count: 10 },
      }),
      op({
        id: "i1",
        hlc: hlc(110, 0, deviceA),
        app,
        table,
        row,
        kind: "increment",
        field: "count",
        by: -1,
      }),
      op({
        id: "i2",
        hlc: hlc(120, 0, deviceB),
        app,
        table,
        row,
        kind: "increment",
        field: "count",
        by: -1,
      }),
    ];
    expect(materialize(applyOps(emptyState(), ops), app, table, row)).toEqual({ count: 8 });
  });

  test("a later set after a delete resurrects only its own fields", () => {
    const ops = [
      op({
        id: "s1",
        hlc: hlc(100, 0, deviceA),
        app,
        table,
        row,
        kind: "set",
        fields: { a: 1, b: 2 },
      }),
      op({ id: "d", hlc: hlc(200, 0, deviceA), app, table, row, kind: "delete" }),
      op({
        id: "s2",
        hlc: hlc(300, 0, deviceB),
        app,
        table,
        row,
        kind: "set",
        fields: { b: 3 },
      }),
    ];
    expect(materialize(applyOps(emptyState(), ops), app, table, row)).toEqual({ b: 3 });
  });

  test("purge hides earlier rows of one app and later writes reappear", () => {
    const oldRow = op({
      id: "old",
      hlc: hlc(100, 0, deviceA),
      app,
      table,
      row,
      kind: "set",
      fields: { count: 1 },
    });
    const otherRow = op({
      id: "other",
      hlc: hlc(110, 0, deviceA),
      app: "other",
      table,
      row,
      kind: "set",
      fields: { count: 2 },
    });
    const purge = op({
      id: "purge",
      hlc: hlc(200, 0, deviceA),
      app,
      kind: "purge_app",
    });
    const purged = applyOps(emptyState(), [oldRow, otherRow, purge]);
    expect(materializeTable(purged, app, table).size).toBe(0);
    expect(materializeTable(purged, "other", table).get(row)).toEqual({ count: 2 });

    const later = op({
      id: "later",
      hlc: hlc(300, 0, deviceB),
      app,
      table,
      row,
      kind: "set",
      fields: { count: 3 },
    });
    expect(materializeTable(applyOps(purged, [later]), app, table).get(row)).toEqual({ count: 3 });
  });

  test("increments older than a later set do not add to the reset counter", () => {
    const ops = [
      op({
        id: "s1",
        hlc: hlc(100, 0, deviceA),
        app,
        table,
        row,
        kind: "set",
        fields: { count: 10 },
      }),
      op({
        id: "i1",
        hlc: hlc(110, 0, deviceA),
        app,
        table,
        row,
        kind: "increment",
        field: "count",
        by: 5,
      }),
      op({
        id: "s2",
        hlc: hlc(200, 0, deviceB),
        app,
        table,
        row,
        kind: "set",
        fields: { count: 4 },
      }),
      op({
        id: "i2",
        hlc: hlc(210, 0, deviceA),
        app,
        table,
        row,
        kind: "increment",
        field: "count",
        by: 2,
      }),
    ];
    expect(materialize(applyOps(emptyState(), ops), app, table, row)).toEqual({ count: 6 });
  });
});
