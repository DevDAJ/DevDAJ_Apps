/**
 * Errors-only PostHog capture shared by every DevDAJ app.
 *
 * Deliberately minimal: no autocapture, no screen views, no session replay, no
 * person profiles. Events are anonymous (`$process_person_profile: false`) and
 * only sent when the project supplied an API key AND capture is enabled (on
 * mobile that gate is the user's opt-in consent). Every method is safe to call
 * at any time: a disabled or unconfigured client is a no-op, and telemetry
 * failures never surface to the app.
 *
 * Each project provides its own PostHog project key; nothing is shared between
 * projects except this code.
 */

export type TelemetryValue = string | number | boolean | null;
export type TelemetryContext = Record<string, TelemetryValue | undefined>;

/** Minimal fetch shape so the package typechecks under DOM, Bun, and RN types alike. */
export type TelemetryFetch = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<unknown>;

export interface TelemetryOptions {
  /** Project name, for example "fitnexx" or "api-fitnexx". */
  app: string;
  /** Stable anonymous id for this install or deployment. Never a user id. */
  distinctId: string;
  /** PostHog project token. Without it the client is a no-op. */
  apiKey?: string;
  /** Ingestion host. Defaults to PostHog US cloud. */
  host?: string;
  appVersion?: string;
  platform?: string;
  os?: string;
  /** Capture gate. Mobile passes user consent (off by default); servers pass key presence. */
  enabled?: boolean;
  fetchImpl?: TelemetryFetch;
  /** Debounce before an automatic flush. 0 disables the timer; call flush() yourself. */
  flushDelayMs?: number;
}

export interface TelemetryClient {
  /** True when a key is present and capture is enabled. */
  readonly enabled: boolean;
  setEnabled(enabled: boolean): void;
  /**
   * Queue a schema-correct `$exception` event. Returns the event id (also sent
   * as `error_id`) so bug reports can reference the exact PostHog event, or
   * null when nothing was captured.
   */
  captureError(error: unknown, context?: TelemetryContext): string | null;
  /** Queue a `bug_report_submitted` event linking a bug_report row to PostHog. */
  captureBugReport(properties: TelemetryContext): string | null;
  /** Send queued events now. Never throws. */
  flush(): Promise<void>;
}

const DEFAULT_HOST = "https://us.i.posthog.com";
const MAX_FRAMES = 50;
const MAX_CAUSE_DEPTH = 5;
const MAX_MESSAGE_LENGTH = 2000;

type StackFrame = {
  platform: string;
  lang: string;
  function: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
};

type ExceptionEntry = {
  type: string;
  value: string;
  mechanism: { type: string; handled: boolean; synthetic: boolean };
  stacktrace?: { type: "raw"; frames: StackFrame[] };
};

type BatchEvent = {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp: string;
  uuid: string;
};

/** Chromium/V8: `at fn (file:line:col)` or `at file:line:col`. */
const V8_FRAME = /^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/;
/** JavaScriptCore/SpiderMonkey (Hermes, Firefox): `fn@file:line:col`. */
const JSC_FRAME = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/;

/** Parse a JS stack into PostHog raw frames, oldest first as ingestion expects. */
export function parseStackFrames(stack: string): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const line of stack.split("\n")) {
    const match = V8_FRAME.exec(line) ?? JSC_FRAME.exec(line);
    if (!match) continue;
    const [, fn, filename, lineno, colno] = match;
    frames.push({
      platform: "custom",
      lang: "javascript",
      function: fn?.trim() || "?",
      filename,
      lineno: Number(lineno),
      colno: Number(colno),
      in_app: !filename.includes("node_modules"),
    });
    if (frames.length >= MAX_FRAMES) break;
  }
  return frames.reverse();
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, MAX_MESSAGE_LENGTH);
  if (typeof error === "string") return error.slice(0, MAX_MESSAGE_LENGTH);
  try {
    return String(error).slice(0, MAX_MESSAGE_LENGTH);
  } catch {
    return "Unserializable error";
  }
}

function exceptionEntry(error: unknown, handled: boolean): ExceptionEntry {
  const entry: ExceptionEntry = {
    type: error instanceof Error ? error.name || "Error" : "Error",
    value: messageOf(error),
    mechanism: { type: "generic", handled, synthetic: false },
  };
  const frames = error instanceof Error && error.stack ? parseStackFrames(error.stack) : [];
  if (frames.length > 0) entry.stacktrace = { type: "raw", frames };
  return entry;
}

/** Outermost error first, then its `cause` chain, mirroring the SDK format. */
function exceptionList(error: unknown): ExceptionEntry[] {
  const list: ExceptionEntry[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current != null; depth++) {
    list.push(exceptionEntry(current, depth === 0));
    current = (current as { cause?: unknown }).cause;
  }
  if (list.length === 0) list.push(exceptionEntry(error, true));
  return list;
}

function cleanContext(context?: TelemetryContext): Record<string, TelemetryValue> {
  const clean: Record<string, TelemetryValue> = {};
  for (const [key, value] of Object.entries(context ?? {})) {
    if (value !== undefined) clean[key] = value;
  }
  return clean;
}

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createTelemetry(options: TelemetryOptions): TelemetryClient {
  const host = (options.host ?? DEFAULT_HOST).replace(/\/+$/, "");
  const doFetch: TelemetryFetch =
    options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  let enabled = options.enabled ?? true;
  let queue: BatchEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const active = () => enabled && Boolean(options.apiKey);

  const baseProperties = (): Record<string, unknown> => ({
    $process_person_profile: false,
    app: options.app,
    ...(options.appVersion ? { app_version: options.appVersion } : {}),
    ...(options.platform ? { platform: options.platform } : {}),
    ...(options.os ? { os: options.os } : {}),
  });

  async function send(events: BatchEvent[]): Promise<void> {
    try {
      await doFetch(`${host}/batch/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: options.apiKey, batch: events }),
      });
    } catch {
      // Telemetry must never surface errors to the app.
    }
  }

  function flush(): Promise<void> {
    if (!active() || queue.length === 0) return Promise.resolve();
    const events = queue;
    queue = [];
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    return send(events);
  }

  function schedule(): void {
    const delay = options.flushDelayMs ?? 1500;
    if (delay <= 0 || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delay);
    (timer as unknown as { unref?: () => void }).unref?.();
  }

  function enqueue(event: string, uuid: string, properties: Record<string, unknown>): boolean {
    if (!active()) return false;
    queue.push({
      event,
      distinct_id: options.distinctId,
      properties,
      timestamp: new Date().toISOString(),
      uuid,
    });
    schedule();
    return true;
  }

  return {
    get enabled() {
      return active();
    },
    setEnabled(on: boolean) {
      enabled = on;
      if (!on) {
        queue = [];
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }
    },
    captureError(error: unknown, context?: TelemetryContext): string | null {
      try {
        const uuid = randomId();
        const queued = enqueue("$exception", uuid, {
          ...baseProperties(),
          ...cleanContext(context),
          error_id: uuid,
          $exception_list: exceptionList(error),
          $exception_level: "error",
        });
        return queued ? uuid : null;
      } catch {
        return null;
      }
    },
    captureBugReport(properties: TelemetryContext): string | null {
      const uuid = randomId();
      return enqueue("bug_report_submitted", uuid, {
        ...baseProperties(),
        ...cleanContext(properties),
      })
        ? uuid
        : null;
    },
    flush,
  };
}
