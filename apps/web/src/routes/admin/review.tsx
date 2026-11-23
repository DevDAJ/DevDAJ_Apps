import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import type { Contribution, Gym } from "../../lib/types";

export const Route = createFileRoute("/admin/review")({ component: Review });

type Row = Contribution & { current: Gym | null; submitted_by: string };
const STATUSES = ["pending", "approved", "rejected"] as const;

function Review() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(
        (await api<{ contributions: Row[] }>(`/admin/contributions?status=${status}`))
          .contributions,
      );
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (id: string, action: "approve" | "reject") => {
    try {
      await api(`/admin/contributions/${id}/${action}`, { body: { note: notes[id] || null } });
      setMessage(action === "approve" ? "Approved and published." : "Rejected.");
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  return (
    <>
      <div className="toolbar">
        <h1>Review queue</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          aria-label="Status"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>
      {message && <p className="notice">{message}</p>}
      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">Nothing {status}.</p>
      ) : (
        rows.map((row) => (
          <article key={row.id} className="card">
            <div className="card-head">
              <h2>
                {row.target_id ? "Edit: " : "New gym: "}
                {row.payload.name}
              </h2>
              <span className={`badge ${row.status}`}>{row.status}</span>
            </div>
            <p className="muted">
              Submitted {new Date(row.created_at).toLocaleString()} by{" "}
              <code>{row.submitted_by}</code>
            </p>
            <div className={row.current ? "grid two" : ""}>
              {row.current && <GymDetails title="Current" gym={row.current} />}
              <GymDetails
                title={row.current ? "Proposed" : "Details"}
                gym={row.payload}
                compare={row.current}
              />
            </div>
            {row.status === "pending" ? (
              <div className="row">
                <input
                  placeholder="Note to contributor (optional)"
                  maxLength={500}
                  value={notes[row.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })}
                />
                <button
                  type="button"
                  className="button"
                  onClick={() => void decide(row.id, "approve")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => void decide(row.id, "reject")}
                >
                  Reject
                </button>
              </div>
            ) : (
              row.review_note && <p className="muted">Note: {row.review_note}</p>
            )}
          </article>
        ))
      )}
    </>
  );
}

function GymDetails({
  title,
  gym,
  compare,
}: {
  title: string;
  gym: Pick<Gym, "name" | "address" | "latitude" | "longitude" | "equipment">;
  compare?: Gym | null;
}) {
  const changed = (key: keyof typeof gym) =>
    compare && JSON.stringify(compare[key]) !== JSON.stringify(gym[key]) ? "changed" : undefined;
  const map = `https://www.openstreetmap.org/?mlat=${gym.latitude}&mlon=${gym.longitude}#map=17/${gym.latitude}/${gym.longitude}`;
  return (
    <dl className="details">
      <dt>{title}</dt>
      <dd className={changed("name")}>{gym.name}</dd>
      <dd className={changed("address")}>
        {gym.address ?? <span className="muted">No address</span>}
      </dd>
      <dd className={changed("latitude") ?? changed("longitude")}>
        <a href={map} target="_blank" rel="noopener noreferrer">
          {gym.latitude}, {gym.longitude}
        </a>
      </dd>
      <dd className={changed("equipment")}>
        {gym.equipment.length ? (
          gym.equipment.join(", ")
        ) : (
          <span className="muted">No equipment listed</span>
        )}
      </dd>
    </dl>
  );
}
