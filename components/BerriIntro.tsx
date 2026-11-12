"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import type { Snapshot } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { setDisplayNameAction } from "@/lib/server/actions";
import { BerriStill, type BerriPose } from "./berripop/BerriVideo";

type Step = "hello" | "name" | "nice";
const POSE: Record<Step, BerriPose> = { hello: "hi", name: "wonder", nice: "joy" };
const MAX_NAME = 40;

/**
 * Berri's first hello for a new member: who Berri is, what to call you, and a
 * happy "nice to meet you" before choosing a path. The name is saved as the
 * display name (the same field as on the profile) and is used only to greet
 * the member; it never goes to analytics.
 */
export default function BerriIntro({ name: initial, onSnapshot, onDone }: { name: string; onSnapshot: (s: Snapshot) => void; onDone: () => void }) {
  const { d, t } = useI18n();
  const c = d.onboarding.intro;
  const [step, setStep] = useState<Step>("hello");
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = name.trim().slice(0, MAX_NAME);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!clean || busy) return;
    if (clean === initial.trim()) return setStep("nice");
    setBusy(true);
    setError(null);
    try {
      const r = await setDisplayNameAction(clean);
      if (r.ok) {
        onSnapshot(r.snapshot);
        setBusy(false);
        return setStep("nice");
      }
    } catch {
      // Falls through to the generic error.
    }
    setBusy(false);
    setError(d.auth.error);
  }

  return (
    <main className="berri-stage berri-intro">
      <BerriStill pose={POSE[step]} className="berri-intro-berri" />
      {step === "hello" && (
        <section className="berri-intro-card" aria-labelledby="bi-title">
          <h1 id="bi-title">{c.helloTitle}</h1>
          <p>{c.helloBody}</p>
          <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => setStep("name")}>
            {c.helloCta} <ArrowRight size={18} aria-hidden />
          </button>
        </section>
      )}
      {step === "name" && (
        <form className="berri-intro-card" aria-labelledby="bi-title" onSubmit={saveName}>
          <h1 id="bi-title">{c.nameTitle}</h1>
          <label className="sr-only" htmlFor="bi-name">{c.nameLabel}</label>
          <input
            id="bi-name"
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={c.namePlaceholder}
            maxLength={MAX_NAME}
            autoComplete="given-name"
            autoCapitalize="words"
            enterKeyHint="done"
            autoFocus
          />
          <p className="muted berri-intro-hint">{c.nameHint}</p>
          {error && <p className="field-hint" role="alert">{error}</p>}
          <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={!clean || busy}>
            {c.nameCta} <ArrowRight size={18} aria-hidden />
          </button>
        </form>
      )}
      {step === "nice" && (
        <section className="berri-intro-card" aria-labelledby="bi-title">
          <h1 id="bi-title">{t(c.niceTitle, { name: clean })}</h1>
          <p>{c.niceBody}</p>
          <button type="button" className="btn btn--primary btn--lg btn--block" onClick={onDone} autoFocus>
            {c.niceCta} <ArrowRight size={18} aria-hidden />
          </button>
        </section>
      )}
    </main>
  );
}
