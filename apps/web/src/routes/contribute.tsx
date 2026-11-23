import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { GymForm } from "../components/GymForm";
import { SignInGate } from "../components/SignInGate";
import { api, errorMessage } from "../lib/api";
import type { Contribution, Gym } from "../lib/types";

export const Route = createFileRoute("/contribute")({
  head: () => ({ meta: [{ title: "Contribute · Apps by DevDAJ" }] }),
  component: Contribute,
});

function Contribute() {
  return (
    <main className="page narrow">
      <h1>Improve the gym map</h1>
      <p className="lede">
        Fitnexx suggests exercises based on the equipment at your gym. Add a gym or fix one, and it
        goes live for everyone once it has been reviewed.
      </p>
      <SignInGate reason="Sign in with your DevDAJ account to suggest gyms.">
        <ContributeForms />
      </SignInGate>
    </main>
  );
}

function ContributeForms() {
  const [mine, setMine] = useState<Contribution[]>([]);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [editing, setEditing] = useState<Gym | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [own, all] = await Promise.all([
        api<{ contributions: Contribution[] }>("/dataset/contributions/mine"),
        api<{ gyms: Gym[] }>("/dataset/gyms"),
      ]);
      setMine(own.contributions);
      setGyms(all.gyms);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (
    payload: Parameters<Parameters<typeof GymForm>[0]["onSubmit"]>[0],
    targetId?: string,
  ) => {
    try {
      await api("/dataset/contributions", { body: { dataset: "gyms", targetId, payload } });
      setMessage("Thanks! Your suggestion is waiting for review.");
      setEditing(null);
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  return (
    <>
      {message && <p className="notice">{message}</p>}
      <section className="card">
        <h2>{editing ? `Suggest a change to ${editing.name}` : "Add a gym"}</h2>
        <GymForm
          key={editing?.id ?? "new"}
          initial={editing ?? undefined}
          submitLabel={editing ? "Suggest change" : "Suggest gym"}
          onSubmit={(payload) => submit(payload, editing?.id)}
        />
        {editing && (
          <button type="button" className="link" onClick={() => setEditing(null)}>
            Cancel and add a new gym instead
          </button>
        )}
      </section>

      <section>
        <h2>Gyms on the map</h2>
        {gyms.length === 0 ? (
          <p className="muted">No gyms yet. Be the first to add one.</p>
        ) : (
          <ul className="list">
            {gyms.map((gym) => (
              <li key={gym.id}>
                <div>
                  <strong>{gym.name}</strong>
                  <span className="muted"> · {gym.equipment.length} equipment</span>
                  {gym.address && <div className="muted">{gym.address}</div>}
                </div>
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => setEditing(gym)}
                >
                  Suggest edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Your suggestions</h2>
        {mine.length === 0 ? (
          <p className="muted">Nothing yet.</p>
        ) : (
          <ul className="list">
            {mine.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.payload.name}</strong>
                  <span className="muted">
                    {" "}
                    · {item.target_id ? "edit" : "new gym"} ·{" "}
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                  {item.review_note && <div className="muted">Reviewer: {item.review_note}</div>}
                </div>
                <span className={`badge ${item.status}`}>{item.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
