import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { BarChart } from "../../components/BarChart";
import { StatusBadge } from "../../components/StatusBadge";
import { api, errorMessage } from "../../lib/api";
import type { AppMetrics } from "../../lib/types";

export const Route = createFileRoute("/admin/")({ component: Metrics });

interface MetricsResponse {
  from: string;
  to: string;
  configured: { google_play: boolean; app_store: boolean };
  lastSyncedAt: string | null;
  apps: AppMetrics[];
}

const RANGES = [7, 30, 90, 365];
const fmt = (value: number | null) => (value === null ? "-" : value.toLocaleString());

function Metrics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<MetricsResponse>(`/admin/metrics?days=${days}`));
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const sync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await api<{ rows: number; stores: Record<string, string> }>(
        "/admin/metrics/sync",
        {
          body: { days },
        },
      );
      const parts = Object.entries(result.stores).map(
        ([store, status]) =>
          `${store === "google_play" ? "Google Play" : "App Store"}: ${status.replace("_", " ")}`,
      );
      setMessage(`Synced ${result.rows} rows. ${parts.join(" · ")}`);
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <div className="toolbar">
        <h1>Downloads &amp; usage</h1>
        <div className="actions">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Range">
            {RANGES.map((n) => (
              <option key={n} value={n}>
                Last {n} days
              </option>
            ))}
          </select>
          <button type="button" className="button" onClick={() => void sync()} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync from stores"}
          </button>
        </div>
      </div>
      {message && <p className="notice">{message}</p>}
      {data && (
        <>
          <p className="muted">
            {data.from} to {data.to} · Google Play{" "}
            {data.configured.google_play ? "connected" : "not configured"} · App Store{" "}
            {data.configured.app_store ? "connected" : "not configured"} · Last sync{" "}
            {data.lastSyncedAt ? new Date(data.lastSyncedAt).toLocaleString() : "never"}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>App</th>
                  <th>Downloads</th>
                  <th>Google Play</th>
                  <th>App Store</th>
                  <th>Active devices</th>
                </tr>
              </thead>
              <tbody>
                {data.apps.map((app) => (
                  <tr key={app.slug}>
                    <td>
                      {app.name} <StatusBadge status={app.status} />
                    </td>
                    <td>{fmt(app.downloads)}</td>
                    <td>{fmt(app.byStore.google_play.downloads)}</td>
                    <td>{fmt(app.byStore.app_store.downloads)}</td>
                    <td>{fmt(app.activeDevices)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.apps
            .filter((app) => app.status !== "coming_soon")
            .map((app) => (
              <section key={app.slug} className="card">
                <h2>{app.name}</h2>
                <div className="grid two">
                  <BarChart
                    label="Daily downloads"
                    points={app.series.map((p) => ({ day: p.day, value: p.downloads }))}
                  />
                  <BarChart
                    label="Active devices (Google Play)"
                    points={app.series.map((p) => ({ day: p.day, value: p.activeDevices }))}
                  />
                </div>
              </section>
            ))}
        </>
      )}
    </>
  );
}
