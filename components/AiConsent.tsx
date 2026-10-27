"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { consentRefused, runWithAiConsent, type AiConsentGate } from "@/lib/legal/aiConsentFlow";
import type { LegalStatus } from "@/lib/legal/records";
import { getLegalStatusAction, setAiConsentAction } from "@/lib/server/actions";
import BerripopMascot from "./berripop/BerripopMascot";

type WithAiConsent = <R>(call: () => Promise<R>) => Promise<R | null>;

const Ctx = createContext<WithAiConsent>(call => call());

/**
 * Wraps an AI action so the consent dialog opens the first time a member uses
 * an AI feature, and the action resumes by itself once consent is recorded.
 * Returns null when the member declined (nothing was sent to the AI).
 */
export const useAiConsent = () => useContext(Ctx);

export function AiConsentProvider({ initial, children }: { initial: LegalStatus; children: ReactNode }) {
  const status = useRef(initial);
  const [open, setOpen] = useState(false);
  // One dialog at a time; every action waiting on it gets the same answer.
  const pending = useRef<{ promise: Promise<boolean>; resolve: (ok: boolean) => void } | null>(null);

  const gate = useMemo<AiConsentGate>(() => ({
    allowed: () => !status.current.aiConsentRequired || status.current.aiConsent === "granted",
    ask: () => {
      if (!pending.current) {
        let resolve!: (ok: boolean) => void;
        const promise = new Promise<boolean>(r => (resolve = r));
        pending.current = { promise, resolve };
        setOpen(true);
      }
      return pending.current.promise;
    },
    invalidate: () => {
      status.current = { ...status.current, aiConsentRequired: true, aiConsent: "missing" };
    },
  }), []);

  const close = useCallback((next: LegalStatus | null) => {
    if (next) status.current = next;
    setOpen(false);
    const p = pending.current;
    pending.current = null;
    p?.resolve(!!next && next.aiConsent === "granted");
  }, []);

  const withAiConsent = useCallback<WithAiConsent>(call => runWithAiConsent(gate, call, consentRefused), [gate]);

  return (
    <Ctx.Provider value={withAiConsent}>
      {children}
      {open && <AiConsentDialog version={status.current.aiConsentVersion} onDone={close} />}
    </Ctx.Provider>
  );
}

/** The consent dialog: what is sent, to whom, why; unchecked by default; saved on the server before anything resumes. */
function AiConsentDialog({ version, onDone }: { version: string; onDone: (status: LegalStatus | null) => void }) {
  const { d, t } = useI18n();
  const c = d.aiConsentDialog;
  const g = d.legalGate;
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  async function grant() {
    setBusy(true);
    setError(null);
    try {
      const r = await setAiConsentAction(true, version);
      if (!r.ok) throw new Error(r.error);
      // Resume only on the server's word that consent is now in place.
      const next = await getLegalStatusAction();
      if (next?.aiConsent === "granted") return onDone(next);
      setError(g.error);
    } catch (e) {
      setError(e instanceof Error && e.message === "outdated" ? g.outdated : g.error);
    }
    setBusy(false);
  }

  return (
    <div className="sheet-backdrop terms-backdrop" onClick={() => onDone(null)}>
      <div className="sheet terms-sheet" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title" onClick={e => e.stopPropagation()}>
        <div className="terms-consent">
          <div className="terms-consent-head">
            <BerripopMascot size={60} mood="happy" />
            <div>
              <h2 id="ai-consent-title">{c.title}</h2>
              <p>{c.body}</p>
            </div>
          </div>
          <ul className="terms-list">{c.points.map(p => <li key={p}>{p}</li>)}</ul>
          <label className="terms-check">
            <input ref={box} type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
            <span>{c.checkbox}</span>
          </label>
          <p className="terms-note">{g.privacyBefore}<a href="/privacy" target="_blank" rel="noopener">{g.privacyLink}</a>{g.privacyAfter}</p>
          {error && <p className="field-hint" role="alert">{error}</p>}
          <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!checked || busy} onClick={grant}>
            <Sparkles size={18} /> {c.accept}
          </button>
          <button type="button" className="btn btn--text terms-cancel" disabled={busy} onClick={() => onDone(null)}>{c.later}</button>
          <small className="terms-version">{t(d.settings.aiVersion, { v: version })}</small>
        </div>
      </div>
    </div>
  );
}
