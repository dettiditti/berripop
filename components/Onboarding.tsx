"use client";

import { useState } from "react";
import { ArrowRight, Check, Sprout, Users } from "lucide-react";
import type { Snapshot } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { startPersonalPathAction } from "@/lib/server/actions";
import BerripopMascot from "./berripop/BerripopMascot";
import CircleSetup from "./CircleSetup";

/** First run after sign-in: start your own path (primary) or grow together in a circle. */
export default function Onboarding({ onSnapshot }: { onSnapshot: (s: Snapshot) => void }) {
  const { d } = useI18n();
  const o = d.onboarding;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startPersonal() {
    setBusy(true);
    setError(null);
    try {
      const r = await startPersonalPathAction();
      if (r.ok) return onSnapshot(r.snapshot);
    } catch {
      // Falls through to the generic error.
    }
    setBusy(false);
    setError(d.auth.error);
  }

  return (
    <main className="onboarding-choice">
      <header className="onboarding-head">
        <BerripopMascot mood="excited" size={92} />
        <h1>{o.title}</h1>
        <p>{o.body}</p>
      </header>

      <div className="onboarding-options">
        <section className="card onboarding-option onboarding-option--primary" aria-labelledby="ob-personal">
          <span className="tag tag--purple">{o.personalBadge}</span>
          <span className="onboarding-icon" aria-hidden><Sprout size={26} /></span>
          <h2 id="ob-personal">{o.personalTitle}</h2>
          <p>{o.personalBody}</p>
          <ul className="onboarding-points">{o.personalPoints.map(x => <li key={x}><Check size={16} strokeWidth={3} aria-hidden /> {x}</li>)}</ul>
          <button type="button" className="btn btn--primary btn--lg btn--block" disabled={busy} onClick={startPersonal}>
            {o.personalCta} <ArrowRight size={18} />
          </button>
          {error && <p className="field-hint" role="alert">{error}</p>}
        </section>

        <section className="card onboarding-option" aria-labelledby="ob-shared">
          <span className="onboarding-icon onboarding-icon--mint" aria-hidden><Users size={26} /></span>
          <h2 id="ob-shared">{o.sharedTitle}</h2>
          <p>{o.sharedBody}</p>
          <CircleSetup onSnapshot={onSnapshot} />
        </section>
      </div>
    </main>
  );
}
