import { createTelemetry, type TelemetryClient, type TelemetryContext } from "@devdaj/telemetry";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

const CONSENT_KEY = "fitnexx.telemetry.consent";
const DEVICE_ID_KEY = "fitnexx.telemetry.deviceId";

/** Diagnostics attached to bug reports and PostHog events. Never user content. */
export type BugReportContext = {
  source: string;
  errorEventId?: string | null;
  errorMessage?: string;
  errorStack?: string;
  requestId?: string;
  scanId?: string;
};

let client: TelemetryClient | null = null;
let deviceId: string | null = null;

/** Load consent and the anonymous install id. Call once at startup. */
export async function initTelemetry(): Promise<void> {
  try {
    const [[, consent], [, storedId]] = await AsyncStorage.multiGet([CONSENT_KEY, DEVICE_ID_KEY]);
    let id = storedId;
    if (!id) {
      id = Crypto.randomUUID();
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    deviceId = id;
    client = createTelemetry({
      app: "fitnexx",
      distinctId: id,
      apiKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
      appVersion: Constants.expoConfig?.version ?? undefined,
      platform: Platform.OS,
      os: `${Platform.OS} ${String(Platform.Version)}`,
      enabled: consent === "true",
    });
  } catch {
    client = null;
  }
}

/** Error reporting is opt-in and off by default. */
export async function getTelemetryConsent(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CONSENT_KEY)) === "true";
  } catch {
    return false;
  }
}

export async function setTelemetryConsent(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(CONSENT_KEY, enabled ? "true" : "false");
  client?.setEnabled(enabled);
}

/** Anonymous install id, stored on bug reports to correlate with PostHog. */
export function telemetryDistinctId(): string | null {
  return deviceId;
}

/** Capture an app error. Returns the PostHog event id, or null when not reporting. */
export function captureAppError(error: unknown, context?: TelemetryContext): string | null {
  const id = client?.captureError(error, context) ?? null;
  if (id) void client?.flush();
  return id;
}

/** Link a submitted bug_report row to its PostHog error event. No-op without consent. */
export function captureBugReportSubmitted(report: {
  bugReportId: string;
  context?: BugReportContext;
}): void {
  const id = client?.captureBugReport({
    bug_report_id: report.bugReportId,
    error_event_id: report.context?.errorEventId ?? null,
    source: report.context?.source ?? "settings",
    request_id: report.context?.requestId,
    scan_id: report.context?.scanId,
  });
  if (id) void client?.flush();
}
