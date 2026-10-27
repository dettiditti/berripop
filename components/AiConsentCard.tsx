"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { LegalStatus } from "@/lib/legal/records";
import { getLegalStatusAction, setAiConsentAction } from "@/lib/server/actions";

/** Settings: the separate, optional consent to AI processing (give or withdraw, with the notice version). */
export default function AiConsentCard({ notify }: { notify: (message: string) => void }) {
  const { d, t } = useI18n();
  const s = d.settings;
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getLegalStatusAction().then(setStatus).catch(() => setStatus(null));
  }, []);

  async function change(granted: boolean) {
    if (!status) return;
    setBusy(true);
    try {
      const r = await setAiConsentAction(granted, status.aiConsentVersion);
      if (!r.ok) throw new Error(r.error);
      setStatus(await getLegalStatusAction());
      notify(s.aiSaved);
    } catch {
      notify(s.aiError);
    }
    setBusy(false);
  }

  if (!status) return null;
  const state = status.aiConsent;
  const stateText = { granted: s.aiGranted, missing: s.aiMissing, withdrawn: s.aiWithdrawn, outdated: s.aiOutdated }[state];

  return (
    <section className="card stack-sm" aria-labelledby="set-ai" id="ai-consent">
      <h2 id="set-ai"><Sparkles size={18} aria-hidden /> {s.aiTitle}</h2>
      <p className="muted">{s.aiBody}</p>
      <p className="muted">{s.aiVoluntary}</p>
      {status.aiConsentRequired ? (
        <>
          <strong>{stateText}</strong>
          <small className="muted">{t(s.aiVersion, { v: status.aiConsentVersion })}</small>
          {state === "granted" ? (
            <button type="button" className="btn btn--ghost btn--sm settings-inline-btn" disabled={busy} onClick={() => change(false)}>{s.aiWithdraw}</button>
          ) : (
            <button type="button" className="btn btn--primary btn--sm settings-inline-btn" disabled={busy} onClick={() => change(true)}>{s.aiGrant}</button>
          )}
        </>
      ) : <strong>{s.aiNotRequired}</strong>}
      <Link href="/privacy">{s.aiPrivacyLink}</Link>
    </section>
  );
}
