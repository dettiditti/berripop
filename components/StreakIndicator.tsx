"use client";

import { Flame } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { StreakInfo } from "@/lib/progress";

type Props = { streak: StreakInfo; shared?: StreakInfo | null; variant?: "chip" | "card" };

/**
 * A gentle "spark" streak. One missed day is a free rest day; missing more
 * never takes anything away: XP and badges stay, and the copy welcomes you back.
 */
export default function StreakIndicator({ streak, shared, variant = "chip" }: Props) {
  const { d, plural, num } = useI18n();
  const g = d.gamification.streak;
  const s = shared ?? streak;
  const lit = s.activeToday;
  const count = s.current;

  if (variant === "chip") {
    return (
      <span className={`streak-chip ${lit ? "is-lit" : ""}`} title={lit ? g.chipLit : g.chipWaiting}>
        <Flame size={16} strokeWidth={2.4} fill={lit ? "currentColor" : "none"} />
        <strong className="tabular" aria-hidden>{num(count)}</strong>
        <span className="sr-only">{plural(shared ? g.srShared : g.srLabel, count)}</span>
      </span>
    );
  }

  let title: string;
  let body: string;
  if (s.welcomeBack && !shared) {
    title = g.welcomeTitle;
    body = g.welcomeBody;
  } else if (count === 0) {
    title = shared ? g.firstSharedTitle : g.firstTitle;
    body = shared ? g.firstSharedBody : g.firstBody;
  } else {
    title = plural(shared ? g.sharedTitle : g.title, count);
    body = lit ? g.litBody : s.restedYesterday ? g.restedBody : g.waitingBody;
  }

  const week = Array.from({ length: 7 }, (_, i) => i < Math.min(7, count));
  return (
    <div className={`streak-card ${lit ? "is-lit" : ""}`}>
      <div className="streak-flame"><Flame size={26} strokeWidth={2.2} fill={lit ? "currentColor" : "none"} /></div>
      <div className="streak-copy">
        <strong>{title}</strong>
        <span>
          {body}
          {s.best > 1 && <> {plural(g.best, s.best)}</>}
        </span>
        <div className="streak-dots" aria-hidden>
          {week.map((on, i) => <i key={i} className={on ? "on" : ""} />)}
        </div>
        <small className="streak-rule">{g.rule}</small>
      </div>
    </div>
  );
}
