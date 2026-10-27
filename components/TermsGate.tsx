"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { acceptTermsAction } from "@/lib/server/actions";
import BerripopMascot from "./berripop/BerripopMascot";

/**
 * Asks for acceptance of the current Terms (unchecked by default, nothing is
 * unlocked until the server has recorded it).
 * - onboarding: the first onboarding step for a new member (a card in the page)
 * - update: a member already using Berripop who has not accepted this version (a dialog over the app)
 * - checkout: started a subscription before accepting (a dialog that continues to payment)
 */
export type TermsContext = "onboarding" | "update" | "checkout";

export default function TermsGate({ version, context, onAccepted, onCancel }: { version: string; context: TermsContext; onAccepted: () => void; onCancel?: () => void }) {
  const { d, t } = useI18n();
  const g = d.legalGate;
  const copy = g[context];
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (context !== "onboarding") box.current?.focus();
  }, [context]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const r = await acceptTermsAction(version);
      if (r.ok) return onAccepted();
      setError(r.error === "outdated" ? g.outdated : g.error);
    } catch {
      setError(g.error);
    }
    setBusy(false);
  }

  const body = (
    <div className="terms-consent">
      <div className="terms-consent-head">
        {context !== "onboarding" && <BerripopMascot size={60} mood="happy" />}
        <div>
          <h2 id="terms-title">{copy.title}</h2>
          <p>{copy.body}</p>
        </div>
      </div>
      <label className="terms-check">
        <input ref={box} type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
        <span>{g.checkboxBefore}<a href="/terms" target="_blank" rel="noopener">{g.termsLink}</a>{g.checkboxAfter}</span>
      </label>
      <p className="terms-note">{g.privacyBefore}<a href="/privacy" target="_blank" rel="noopener">{g.privacyLink}</a>{g.privacyAfter}</p>
      {error && <p className="field-hint" role="alert">{error}</p>}
      <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!checked || busy} onClick={accept}>
        {copy.accept} <ArrowRight size={18} />
      </button>
      {onCancel && <button type="button" className="btn btn--text terms-cancel" onClick={onCancel}>{d.common.cancel}</button>}
      <small className="terms-version">{t(g.version, { v: version })}</small>
    </div>
  );

  if (context === "onboarding") return <section className="card terms-step" aria-labelledby="terms-title">{body}</section>;
  return (
    <div className="sheet-backdrop terms-backdrop">
      <div className="sheet terms-sheet" role="dialog" aria-modal="true" aria-labelledby="terms-title">{body}</div>
    </div>
  );
}
