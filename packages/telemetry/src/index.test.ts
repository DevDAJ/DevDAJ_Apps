import { describe, expect, test } from "vite-plus/test";
import { createTelemetry, parseStackFrames, type TelemetryFetch } from "./index";

function recordingFetch() {
  const calls: Array<{ url: string; body: unknown }> = [];
  const impl: TelemetryFetch = async (input, init) => {
    calls.push({ url: input, body: JSON.parse(init.body) });
    return new Response("{}", { status: 200 });
  };
  return { calls, impl };
}

function clientWith(overrides: Parameters<typeof createTelemetry>[0]) {
  const { calls, impl } = recordingFetch();
  const client = createTelemetry({ fetchImpl: impl, flushDelayMs: 0, ...overrides });
  return { calls, client };
}

describe("createTelemetry gating", () => {
  test("no key is a no-op", async () => {
    const { calls, client } = clientWith({ app: "fitnexx", distinctId: "device-1" });
    expect(client.enabled).toBe(false);
    expect(client.captureError(new Error("boom"))).toBeNull();
    await client.flush();
    expect(calls).toHaveLength(0);
  });

  test("disabled by consent is a no-op even with a key", async () => {
    const { calls, client } = clientWith({
      app: "fitnexx",
      distinctId: "device-1",
      apiKey: "phc_test",
      enabled: false,
    });
    expect(client.captureError(new Error("boom"))).toBeNull();
    await client.flush();
    expect(calls).toHaveLength(0);
  });

  test("setEnabled toggles capture and drops queued events on opt-out", async () => {
    const { calls, client } = clientWith({
      app: "fitnexx",
      distinctId: "device-1",
      apiKey: "phc_test",
      enabled: false,
    });
    client.setEnabled(true);
    expect(client.captureError(new Error("boom"))).not.toBeNull();
    client.setEnabled(false);
    await client.flush();
    expect(calls).toHaveLength(0);
  });
});

describe("createTelemetry payloads", () => {
  test("sends a schema-correct anonymous $exception batch", async () => {
    const { calls, client } = clientWith({
      app: "fitnexx",
      distinctId: "device-1",
      apiKey: "phc_test",
      appVersion: "1.2.3",
      platform: "ios",
      os: "ios 18",
    });
    const error = new TypeError("bad scan");
    error.stack =
      "TypeError: bad scan\n    at scan (/app/scan.ts:10:5)\n    at run (/app/run.ts:2:1)";
    const id = client.captureError(error, {
      source: "food-analysis",
      scan_id: "s1",
      skipped: undefined,
    });
    expect(id).not.toBeNull();
    await client.flush();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://us.i.posthog.com/batch/");
    const body = calls[0].body as {
      api_key: string;
      batch: Array<{
        event: string;
        distinct_id: string;
        uuid: string;
        properties: Record<string, unknown>;
      }>;
    };
    expect(body.api_key).toBe("phc_test");
    expect(body.batch).toHaveLength(1);
    const event = body.batch[0];
    expect(event.event).toBe("$exception");
    expect(event.distinct_id).toBe("device-1");
    expect(event.uuid).toBe(id);
    expect(event.properties.$process_person_profile).toBe(false);
    expect(event.properties.app).toBe("fitnexx");
    expect(event.properties.app_version).toBe("1.2.3");
    expect(event.properties.platform).toBe("ios");
    expect(event.properties.error_id).toBe(id);
    expect(event.properties.source).toBe("food-analysis");
    expect(event.properties.scan_id).toBe("s1");
    expect(event.properties).not.toHaveProperty("skipped");
    expect(event.properties.$exception_level).toBe("error");

    const list = event.properties.$exception_list as Array<{
      type: string;
      value: string;
      mechanism: { handled: boolean };
      stacktrace: { type: string; frames: Array<{ filename: string; lineno: number }> };
    }>;
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe("TypeError");
    expect(list[0].value).toBe("bad scan");
    expect(list[0].mechanism.handled).toBe(true);
    expect(list[0].stacktrace.type).toBe("raw");
    // Oldest frame first.
    expect(list[0].stacktrace.frames[0].filename).toBe("/app/run.ts");
    expect(list[0].stacktrace.frames[1].filename).toBe("/app/scan.ts");
    expect(list[0].stacktrace.frames[1].lineno).toBe(10);
  });

  test("includes the cause chain and coerces non-Error values", async () => {
    const { calls, client } = clientWith({
      app: "api",
      distinctId: "server:api",
      apiKey: "phc_test",
    });
    client.captureError(new Error("outer", { cause: new Error("inner") }));
    client.captureError("plain string");
    await client.flush();
    const batch = (calls[0].body as { batch: Array<{ properties: Record<string, unknown> }> })
      .batch;
    const list = batch[0].properties.$exception_list as Array<{ value: string }>;
    expect(list.map((entry) => entry.value)).toEqual(["outer", "inner"]);
    const second = batch[1].properties.$exception_list as Array<{ value: string }>;
    expect(second[0].value).toBe("plain string");
  });

  test("bug report events carry the correlation ids", async () => {
    const { calls, client } = clientWith({
      app: "fitnexx",
      distinctId: "device-1",
      apiKey: "phc_test",
    });
    const id = client.captureBugReport({ bug_report_id: "r1", error_event_id: "e1" });
    await client.flush();
    const event = (
      calls[0].body as {
        batch: Array<{ event: string; uuid: string; properties: Record<string, unknown> }>;
      }
    ).batch[0];
    expect(event.event).toBe("bug_report_submitted");
    expect(event.uuid).toBe(id);
    expect(event.properties.bug_report_id).toBe("r1");
    expect(event.properties.error_event_id).toBe("e1");
  });

  test("custom host is honored and trailing slashes trimmed", async () => {
    const { calls, client } = clientWith({
      app: "fitnexx",
      distinctId: "device-1",
      apiKey: "phc_test",
      host: "https://eu.i.posthog.com/",
    });
    client.captureError(new Error("boom"));
    await client.flush();
    expect(calls[0].url).toBe("https://eu.i.posthog.com/batch/");
  });
});

describe("createTelemetry resilience", () => {
  test("fetch failures are swallowed and the queue drains", async () => {
    const impl: TelemetryFetch = async () => {
      throw new Error("offline");
    };
    const client = createTelemetry({
      app: "fitnexx",
      distinctId: "device-1",
      apiKey: "phc_test",
      fetchImpl: impl,
      flushDelayMs: 0,
    });
    expect(client.captureError(new Error("boom"))).not.toBeNull();
    await expect(client.flush()).resolves.toBeUndefined();
    await expect(client.flush()).resolves.toBeUndefined();
  });

  test("batches multiple events into one request", async () => {
    const { calls, client } = clientWith({
      app: "fitnexx",
      distinctId: "device-1",
      apiKey: "phc_test",
    });
    client.captureError(new Error("one"));
    client.captureError(new Error("two"));
    await client.flush();
    expect(calls).toHaveLength(1);
    expect((calls[0].body as { batch: unknown[] }).batch).toHaveLength(2);
  });
});

describe("parseStackFrames", () => {
  test("parses V8 and JSC formats and marks node_modules out of app", () => {
    const frames = parseStackFrames(
      [
        "Error: x",
        "    at foo (/app/a.ts:1:2)",
        "    at /app/b.ts:3:4",
        "bar@/app/c.ts:5:6",
        "    at dep (/app/node_modules/lib/d.js:7:8)",
      ].join("\n"),
    );
    expect(frames).toHaveLength(4);
    expect(frames[3].function).toBe("foo");
    expect(frames[2].function).toBe("?");
    expect(frames[1].function).toBe("bar");
    expect(frames[0].in_app).toBe(false);
    expect(frames[3].in_app).toBe(true);
  });
});
