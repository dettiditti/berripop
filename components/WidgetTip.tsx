"use client";

import { useEffect, useRef } from "react";
import { Flame } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { HeadItemId } from "@/lib/wardrobe";
import { BerriStill } from "./berripop/BerriVideo";

/**
 * In the iPhone app: Berri can live on the Home Screen too. A little picture
 * of the widget, the three steps to add it, and "I'll do it" / "Later".
 * Closes with a button, a tap outside (later) or Esc (later).
 */
export default function WidgetTip({ streak, bites, wear, onDone, onLater }: { streak: number; bites: number; wear: HeadItemId | null; onDone: () => void; onLater: () => void }) {
  const { d, num } = useI18n();
  const w = d.widgetTip;
  const ctaRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ctaRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onLater(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onLater]);

  return (
    <div className="streak-welcome widget-tip" role="dialog" aria-modal="true" aria-labelledby="widget-tip-title" onClick={e => { if (e.target === e.currentTarget) onLater(); }}>
      <div className="streak-welcome-rays" aria-hidden />
      <div className="streak-welcome-inner">
        <div className="widget-tip-preview" role="img" aria-label={w.sr}>
          <span className="widget-tip-spark"><Flame size={14} fill="currentColor" aria-hidden /> {num(streak)}</span>
          <BerriStill pose="calm" wear={wear} className="widget-tip-berri" />
          <span className="widget-tip-bowl" aria-hidden>{[0, 1, 2].map(i => <i key={i} className={i < bites ? "is-on" : ""} />)}</span>
        </div>
        <h2 className="widget-tip-title" id="widget-tip-title">{w.title}</h2>
        <p className="widget-tip-body">{w.body}</p>
        <ol className="widget-tip-steps">
          {w.steps.map((s, i) => <li key={i}><b>{i + 1}</b><span>{s}</span></li>)}
        </ol>
        <button ref={ctaRef} type="button" className="btn btn--white btn--lg btn--block" onClick={onDone}>{w.cta}</button>
        <button type="button" className="widget-tip-later" onClick={onLater}>{w.later}</button>
      </div>
    </div>
  );
}
