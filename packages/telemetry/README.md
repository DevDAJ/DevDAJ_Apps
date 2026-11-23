# @devdaj/telemetry

Errors-only PostHog capture shared by every DevDAJ app. Each project supplies
its own PostHog project key; nothing else is shared between projects.

## What it does

- Sends schema-correct `$exception` events (PostHog error tracking) and
  `bug_report_submitted` correlation events via the `/batch/` capture API.
- Works anywhere `fetch` exists: Expo/React Native, Node, browsers. No SDK
  dependencies, no native modules.
- Anonymous by construction: `$process_person_profile: false`, a random
  install/deployment id as `distinct_id`, never a user id or email.

## What it never does

No autocapture, no screen views, no pageviews, no session replay, no person
profiles, no feature flags, no surveys. Only the errors you explicitly capture.

## Gating

A client is a no-op unless both are true:

1. `apiKey` is set (the project's own PostHog key).
2. `enabled` is true. On mobile this is the user's opt-in consent, off by
   default (Fitnexx: Settings > Privacy > Error reporting). On servers the
   caller passes key presence, since server errors contain no user behavior.

Every method is safe at any time; telemetry failures are swallowed and never
surface to the app.

## Usage

```ts
import { createTelemetry } from "@devdaj/telemetry";

const telemetry = createTelemetry({
  app: "fitnexx",
  distinctId: anonymousInstallId,
  apiKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  enabled: userConsented,
  appVersion: "1.0.0",
  platform: "ios",
  os: "ios 18",
});

const errorEventId = telemetry.captureError(error, { source: "food-analysis", scan_id: scanId });
await telemetry.flush();
```

`captureError` returns the event id (also sent as `error_id` and as the event
`uuid`). Store it on the `bug_report` row (`error_event_id`) so a report links
to the exact PostHog exception. `telemetry_distinct_id` on the same row links
to the install's other events.

## Keys per project

| Surface                | Env var                                                                        |
| ---------------------- | ------------------------------------------------------------------------------ |
| Fitnexx mobile         | `EXPO_PUBLIC_POSTHOG_KEY` (+ optional `EXPO_PUBLIC_POSTHOG_HOST`)              |
| Fitnexx API (apps/web) | `FITNEXX_POSTHOG_API_KEY`                                                      |
| Future apps            | `<APP>_POSTHOG_API_KEY`, resolved by `apps/web/src/server/shared/telemetry.ts` |

Shared host override for servers: `POSTHOG_HOST` (defaults to
`https://us.i.posthog.com`; use `https://eu.i.posthog.com` for EU projects).

## Correlation workflow

1. An error is captured: `$exception` with `error_id`, `app`, `platform`,
   `app_version`, plus caller context (route, scan ids, ...).
2. The user taps "Report a bug" on the error screen: the `bug_report` row gets
   `context`, `telemetry_distinct_id`, `error_event_id`.
3. If consent is on, a `bug_report_submitted` event carries `bug_report_id`
   and `error_event_id`, so PostHog and the database point at each other.

## Development

From `packages/telemetry`: `vp test`, `tsc --noEmit`. From the repo root:
`bun run ready` is the full gate.
