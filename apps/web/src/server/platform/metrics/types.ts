export type Store = "google_play" | "app_store";

/** One day of store numbers for one app. `null` means the store does not report that figure. */
export interface DailyMetric {
  app: string;
  store: Store;
  day: string; // YYYY-MM-DD
  downloads: number | null;
  active_devices: number | null;
}
