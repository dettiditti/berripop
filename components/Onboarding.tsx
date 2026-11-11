"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Sprout, Users } from "lucide-react";
import type { Snapshot } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { clearStart, readStart, resumeStep, type StartData } from "@/lib/onboarding/start";
import { saveAssessmentAnswersAction, setDisplayNameAction, setProfileAction, setSceneAction, startAssessmentAction, startPersonalPathAction } from "@/lib/server/actions";
import BerriIntro from "./BerriIntro";
import BerripopMascot from "./berripop/BerripopMascot";
import BerriVideo from "./berripop/BerriVideo";
import CircleSetup from "./CircleSetup";
import TermsGate from "./TermsGate";

type Props = { name: string; onSnapshot: (s: Snapshot) => void; terms: { version: string; onAccepted: () => void } | null };

/**
 * First run after sign-in. Someone who already answered the phone app's first
 * questions (AppStart) carries straight on: Terms if needed, then their own
 * path with those answers saved into the assessment, which opens next.
 * Everyone else: Berri says hello and asks what to call you, then start your
 * own path (primary) or grow together in a circle. A member who has not
 * accepted the current Terms accepts them before choosing.
 */
export default function Onboarding(props: Props) {
  const [start, setStart] = useState<StartData | null | undefined>(undefined);
  useEffect(() => setStart(readStart()), []);
  if (start === undefined) return null;
  if (start) return <ContinueFromStart {...props} start={start} onRestart={() => { clearStart(); setStart(null); }} />;
  return <FirstRun {...props} />;
}

function ContinueFromStart({ name, onSnapshot, terms, start, onRestart }: Props & { start: StartData; onRestart: () => void }) {
  const { d } = useI18n();
  const s = d.appStart;
  const [failed, setFailed] = useState(false);
  const running = useRef(false);

  async function carryOn() {
    if (running.current) return;
    running.current = true;
    setFailed(false);
    try {
      if (start.name && start.name !== name.trim()) await setDisplayNameAction(start.name);
      if (start.profile.ageRange || start.profile.gender) {
        const p = await setProfileAction(start.profile);
        if (!p.ok) throw new Error("profile");
      }
      if (start.scene) {
        const sc = await setSceneAction(start.scene);
        if (!sc.ok) throw new Error("scene");
      }
      const r = await startPersonalPathAction();
      if (!r.ok) throw new Error("path");
      const a = await startAssessmentAction();
      if (!a.ok) throw new Error("assessment");
      const saved = await saveAssessmentAnswersAction(start.answers, resumeStep(start.answers));
      if (!saved.ok) throw new Error("answers");
      clearStart();
      // Last, as it leaves onboarding: the app then reopens the assessment where it continues.
      onSnapshot(r.snapshot);
    } catch {
      running.current = false;
      setFailed(true);
    }
  }

  useEffect(() => {
    if (!terms) void carryOn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms]);

  if (terms) {
    return (
      <main className="onboarding-choice">
        <header className="onboarding-head">
          <BerripopMascot mood="excited" size={92} />
          <h1>{s.termsTitle}</h1>
          <p>{s.termsBody}</p>
        </header>
        <TermsGate version={terms.version} context="onboarding" onAccepted={terms.onAccepted} />
      </main>
    );
  }

  return (
    <main className="berri-stage app-start app-start--ready">
      <BerriVideo clip="joy" className="app-start-berri" />
      <section className="berri-intro-card" aria-live="polite">
        {failed ? (
          <>
            <p>{s.error}</p>
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={carryOn}>{s.retry}</button>
            <button type="button" className="btn btn--text btn--inline" onClick={onRestart}>{s.restart}</button>
          </>
        ) : <p>{s.preparing}</p>}
      </section>
    </main>
  );
}

function FirstRun({ name, onSnapshot, terms }: Props) {
  const { d } = useI18n();
  const o = d.onboarding;
  const [met, setMet] = useState(false);
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

  if (!met) return <BerriIntro name={name} onSnapshot={onSnapshot} onDone={() => setMet(true)} />;

  return (
    <main className="onboarding-choice">
      <header className="onboarding-head">
        <BerripopMascot mood="excited" size={92} />
        <h1>{o.title}</h1>
        <p>{o.body}</p>
      </header>

      {terms ? <TermsGate version={terms.version} context="onboarding" onAccepted={terms.onAccepted} /> : <div className="onboarding-options">
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
      </div>}
    </main>
  );
}
