import { type FormEvent, useState } from "react";
import type { GymProposal } from "../lib/types";

export function GymForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: GymProposal;
  submitLabel: string;
  onSubmit: (proposal: GymProposal) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [latitude, setLatitude] = useState(initial ? String(initial.latitude) : "");
  const [longitude, setLongitude] = useState(initial ? String(initial.longitude) : "");
  const [equipment, setEquipment] = useState(initial?.equipment.join("\n") ?? "");
  const [busy, setBusy] = useState(false);

  const locate = () => {
    navigator.geolocation?.getCurrentPosition((position) => {
      setLatitude(position.coords.latitude.toFixed(6));
      setLongitude(position.coords.longitude.toFixed(6));
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit({
        name,
        address: address.trim() || null,
        latitude: Number(latitude),
        longitude: Number(longitude),
        equipment: equipment
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Gym name
        <input
          required
          minLength={2}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Address <span className="muted">(optional)</span>
        <input maxLength={240} value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <div className="row">
        <label>
          Latitude
          <input
            required
            inputMode="decimal"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
          />
        </label>
        <label>
          Longitude
          <input
            required
            inputMode="decimal"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
          />
        </label>
        <button type="button" className="button ghost" onClick={locate}>
          Use my location
        </button>
      </div>
      <label>
        Equipment{" "}
        <span className="muted">(one per line, e.g. Barbell, Cable machine, Dumbbells)</span>
        <textarea rows={6} value={equipment} onChange={(e) => setEquipment(e.target.value)} />
      </label>
      <button className="button" type="submit" disabled={busy}>
        {busy ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}
