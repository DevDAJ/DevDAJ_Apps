import { createTelemetry } from "@devdaj/telemetry";

/**
 * Per-app server error capture. Each app supplies its own PostHog project key
 * via `<APP>_POSTHOG_API_KEY` (for example FITNEXX_POSTHOG_API_KEY); without a
 * key nothing is sent. Only unhandled and 5xx errors reach this module, see
 * shared/errors.ts. Events are anonymous: no user ids, no person profiles.
 */

/** `/api/v1/<app>/...` -> app name, or null for shared routes such as /health. */
export function appOfPath(pathname: string): string | null {
  const match = /^\/api\/v\d+\/([a-z0-9-]+)(?:\/|$)/.exec(pathname);
  return match ? match[1] : null;
}

export function reportApiError(
  error: unknown,
  info: { path: string; method: string; status: number },
): void {
  const app = appOfPath(info.path);
  if (!app) return;
  const apiKey = process.env[`${app.toUpperCase()}_POSTHOG_API_KEY`];
  if (!apiKey) return;
  const client = createTelemetry({
    app: `api-${app}`,
    distinctId: `server:${app}`,
    apiKey,
    host: process.env.POSTHOG_HOST,
    platform: "server",
    os: process.platform,
    flushDelayMs: 0,
  });
  client.captureError(error, {
    source: "api",
    route: info.path,
    method: info.method,
    status: info.status,
  });
  void client.flush();
}
