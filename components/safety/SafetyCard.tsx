"use client";

import { useState } from "react";
import { LifeBuoy, Phone, X } from "lucide-react";
import { HELPLINES } from "@/lib/safety/crisis";
import { useI18n } from "@/lib/i18n/client";

/** Help numbers for a hard moment: shown unasked when a signal fires, and always reachable from SafetyLink. */
export function SafetyCard({ asked = false, onClose }: { asked?: boolean; onClose?: () => void }) {
  const { d, t } = useI18n();
  const s = d.safety;
  return (
    <section className="card safety-card" role="region" aria-labelledby="safety-title">
      <div className="safety-head">
        <LifeBuoy size={22} aria-hidden />
        <h2 id="safety-title">{s.title}</h2>
        {onClose && <button type="button" className="icon-btn" aria-label={s.close} onClick={onClose} autoFocus><X size={18} /></button>}
      </div>
      <p>{asked ? s.bodyAsked : s.body}</p>
      <ul className="safety-lines">
        {HELPLINES.map(h => (
          <li key={h.id}>
            <span><strong>{s.helplines[h.id].name}</strong><small>{s.helplines[h.id].detail}</small></span>
            <a className="btn btn--white btn--block safety-call" href={`tel:${h.tel}`} aria-label={t(s.call, { number: h.number, name: s.helplines[h.id].name })}>
              <Phone size={16} aria-hidden /> <strong>{h.number}</strong>
            </a>
          </li>
        ))}
      </ul>
      <p>{s.someone}</p>
      <small className="muted">{s.limits}</small>
    </section>
  );
}

/** The always-available way to the help numbers. */
export function SafetyLink() {
  const { d } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn--text btn--sm safety-link" onClick={() => setOpen(true)}><LifeBuoy size={14} aria-hidden /> {d.safety.linkLabel}</button>
      {open && (
        <div className="sheet-backdrop" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }} onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}>
          <div className="sheet safety-sheet" role="dialog" aria-modal="true" aria-labelledby="safety-title">
            <SafetyCard asked onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
