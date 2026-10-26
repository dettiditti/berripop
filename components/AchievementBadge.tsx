"use client";

import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { AchievementDef as BadgeDef } from "@/lib/domain/rules";
import type { BadgeId } from "@/lib/progress";

/** Original badge illustrations, drawn on a 32×32 grid in the current colour. */
const art: Record<BadgeId, ReactNode> = {
  // A tiny grape taking its first step.
  "first-tiny-step": (
    <>
      <circle cx="16" cy="14" r="8" fill="currentColor" opacity="0.25" />
      <circle cx="16" cy="14" r="8" />
      <path d="M16 6 q1-3 4-4" />
      <path d="M12 22 l-2 5 M20 22 l3 4" />
      <path d="M8 28 h4 M21 27 h4" />
    </>
  ),
  // Magnifying glass over a sparkle.
  "curious-mind": (
    <>
      <circle cx="13" cy="13" r="8" fill="currentColor" opacity="0.2" />
      <circle cx="13" cy="13" r="8" />
      <path d="M19 19 l8 8" strokeWidth="3.4" />
      <path d="M13 9 v8 M9 13 h8" strokeWidth="2" />
    </>
  ),
  // Ear with sound waves.
  "good-listener": (
    <>
      <path d="M9 13 a7 7 0 1 1 14 0 c0 5 -5 6 -5 10 a3 3 0 0 1 -6 0" fill="currentColor" fillOpacity="0.2" />
      <path d="M13 13 a3 3 0 1 1 6 0 c0 2 -2 2.5 -2 4" />
      <path d="M26 9 q2 4 0 8" />
      <path d="M29 6 q3.5 7 0 14" />
    </>
  ),
  // Two grapes leaning together under one leaf.
  "growing-together": (
    <>
      <circle cx="11" cy="19" r="7" fill="currentColor" opacity="0.25" />
      <circle cx="11" cy="19" r="7" />
      <circle cx="21" cy="19" r="7" />
      <path d="M16 11 q0-4 3-6 q5 0 7 3 q-4 3 -10 3" />
    </>
  ),
  // A star holding a seven.
  "seven-little-wins": (
    <>
      <path d="M16 3 l3.9 8 8.6 1.2 -6.3 6 1.6 8.6 L16 22.7 8.2 26.8 9.8 18.2 3.5 12.2 12.1 11 z" fill="currentColor" fillOpacity="0.2" strokeLinejoin="round" />
      <path d="M13 12.5 h6 l-3.5 8" strokeWidth="2.4" />
    </>
  ),
  // Folded map with a dotted trail and a flag.
  "journey-explorer": (
    <>
      <path d="M4 8 l8-3 8 3 8-3 v19 l-8 3 -8-3 -8 3 z" fill="currentColor" fillOpacity="0.15" strokeLinejoin="round" />
      <path d="M8 21 q4-1 5-5 t7-5" strokeDasharray="1.5 3" />
      <path d="M21 11 V5 l4 1.6 -4 1.6" />
    </>
  ),
  // A full grape bunch.
  "full-bunch": (
    <>
      <path d="M16 6 q0-3 3-4 q4 0 6 3 q-4 2 -9 1" />
      {[[10, 11], [16, 11], [22, 11], [13, 17], [19, 17], [16, 23]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.6" fill="currentColor" fillOpacity="0.25" />
      ))}
    </>
  ),
};

type Props = {
  def: BadgeDef;
  unlocked: boolean;
  current?: number;
  justUnlocked?: boolean;
  size?: "sm" | "md";
  /** Shown instead of progress for circle badges when you're solo. */
  lockedHint?: string;
};

export default function AchievementBadge({ def, unlocked, current = 0, justUnlocked = false, size = "md", lockedHint }: Props) {
  const { d, t } = useI18n();
  const text = d.gamification.badges[def.id];
  return (
    <div className={`achievement achievement--${size} tone-${def.tone} ${unlocked ? "is-unlocked" : "is-locked"} ${justUnlocked ? "just-unlocked" : ""}`}>
      <div className="achievement-medal">
        <svg viewBox="0 0 32 32" width={size === "sm" ? 26 : 32} height={size === "sm" ? 26 : 32} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
          {art[def.id]}
        </svg>
        {!unlocked && <span className="achievement-lock"><Lock size={11} strokeWidth={3} /></span>}
      </div>
      <div className="achievement-copy">
        <strong>{text.name}</strong>
        <span>{unlocked ? text.description : lockedHint ?? text.condition}</span>
        {!unlocked && !lockedHint && def.target > 1 && (
          <div className="bar bar--thin" aria-label={t(d.gamification.badgeProgress, { current, target: def.target })}>
            <span style={{ width: `${(current / def.target) * 100}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
