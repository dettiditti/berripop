"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { acceptTermsAction } from "@/lib/server/actions";
import BerripopMascot from "./berripop/BerripopMascot";

/** Asks for acceptance of the current Terms (unchecked by default); shown to new members and after a version bump. */
export default function TermsGate({ version, updated, onAccepted }: { version: string; updated: boolean; onAccepted: () => void }) {
  const { d, t } = useI18n();
  const g = d.legalGate;
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="splash">
      <BerripopMascot size={88} mood="happy" />
      <h1>{g.title}</h1>
      <p className="muted splash-msg">{updated ? g.updated : g.intro}</p>
      <label className="settings-field">
        <span>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />{" "}
          {g.checkboxBefore}<a href="/terms" target="_blank" rel="noopener">{g.termsLink}</a>{g.checkboxAfter}
        </span>
      </label>
      <small className="muted">{g.privacyBefore}<a href="/privacy" target="_blank" rel="noopener">{g.privacyLink}</a>{g.privacyAfter}</small>
      <small className="muted">{t(g.version, { v: version })}</small>
      {error && <p className="field-hint" role="alert">{error}</p>}
      <button className="btn btn--primary" disabled={!checked || busy} onClick={accept}>{g.accept}</button>
    </div>
  );
}
