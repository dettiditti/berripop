"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { hapticSuccess } from "@/lib/nativeBridge";
import type { StreakInfo } from "@/lib/progress";
import { lastSevenDays, type StreakWelcomeKind } from "@/lib/streakWelcome";
import { poseSrc } from "./berripop/BerriVideo";

/**
 * Once a day on Today: Berri celebrating the member's spark (how many days in
 * a row they have been here) with the last seven days, or a warm welcome back
 * after a break. Closes with the button, a tap outside, or Esc.
 */
export default function StreakWelcome({ kind, streak, active, today, onDone }: { kind: StreakWelcomeKind; streak: StreakInfo; active: ReadonlySet<string>; today: string; onDone: () => void }) {
  const { d, t, plural, num } = useI18n();
  const w = d.gamification.streak.welcome;
  const back = kind === "back";
  const n = streak.current;
  const record = !back && n >= 3 && n >= streak.best;
  const week = lastSevenDays(active, today);

  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    hapticSuccess();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  const body = back ? w.backBody : streak.activeToday ? w.todayLit : t(streak.restedYesterday ? w.rested : w.keepGoing, { n: n + 1 });

  return (
    <div className="streak-welcome" role="dialog" aria-modal="true" aria-labelledby="streak-welcome-title" onClick={e => { if (e.target === e.currentTarget) onDone(); }}>
      <div className="streak-welcome-rays" aria-hidden />
      <div className="streak-welcome-inner">
        {/* eslint-disable-next-line @next/next/no-img-element -- transparent still from public/berri/pose */}
        <img className="streak-welcome-berri" src={poseSrc(back ? "hi" : n >= 3 ? "celebrate" : "joy")} alt="" aria-hidden />
        {back ? (
          <h2 className="streak-welcome-back" id="streak-welcome-title">{w.backTitle}</h2>
        ) : (
          <h2 className="streak-welcome-count" id="streak-welcome-title">
            <strong className="tabular">{num(n)}</strong>
            <span>{plural(w.label, n)}</span>
          </h2>
        )}
        {record && <span className="streak-welcome-record">{w.record}</span>}
        <div className="streak-welcome-week" role="img" aria-label={w.srWeek}>
          {week.map(day => (
            <span key={day.date} className={`streak-welcome-day ${day.on ? "is-on" : ""} ${day.today ? "is-today" : ""}`}>
              <small>{w.days[day.weekday]}</small>
              <i>{day.on && <Check size={16} strokeWidth={3.4} />}</i>
            </span>
          ))}
        </div>
        <p className="streak-welcome-body">{body}</p>
        <button ref={closeRef} type="button" className="btn btn--white btn--lg btn--block streak-welcome-cta" onClick={onDone}>{w.cta}</button>
      </div>
    </div>
  );
}
