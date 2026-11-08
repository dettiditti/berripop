"use client";

import { useEffect, useRef } from "react";
import { BADGE_ART } from "./AchievementBadge";
import { MILESTONE_ICONS } from "./profile/milestoneIcons";
import { achievementDefs } from "@/lib/domain/rules";
import { useI18n } from "@/lib/i18n/client";
import { CELEBRATE_COPY } from "@/lib/celebrate";
import { MILESTONE_COPY, type MilestoneId } from "@/lib/milestones";
import type { BadgeId } from "@/lib/progress";

export type CelebrationItem = { kind: "badge"; id: BadgeId } | { kind: "milestone"; id: MilestoneId };

/** A full-screen moment for a newly reached badge or milestone. Stays until the member closes it (button, tap outside, or Esc). */
export default function Celebration({ item, onDone }: { item: CelebrationItem; onDone: () => void }) {
  const { d, locale } = useI18n();
  const copy = CELEBRATE_COPY[locale];

  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onDone]);

  let eyebrow: string, title: string, hint: string, tone = "purple", art;
  if (item.kind === "badge") {
    const def = achievementDefs.find(a => a.id === item.id);
    const text = d.gamification.badges[item.id];
    eyebrow = copy.badge; title = text.name; hint = text.description; tone = def?.tone ?? "purple";
    art = <svg viewBox="0 0 32 32" width={64} height={64} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>{BADGE_ART[item.id]}</svg>;
  } else {
    const Icon = MILESTONE_ICONS[item.id];
    const text = MILESTONE_COPY[locale].items[item.id];
    eyebrow = copy.milestone; title = text.label; hint = text.hint;
    art = <Icon size={60} strokeWidth={2} aria-hidden />;
  }

  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-labelledby="celebrate-title" onClick={e => { if (e.target === e.currentTarget) onDone(); }}>
      <div className={`celebrate-card tone-${tone}`}>
        <span className="celebrate-burst" aria-hidden>{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</span>
        <span className="celebrate-medal">{art}</span>
        <span className="celebrate-eyebrow">{eyebrow}</span>
        <strong className="celebrate-title" id="celebrate-title">{title}</strong>
        <span className="celebrate-hint">{hint}</span>
        <button ref={closeRef} type="button" className="celebrate-close" onClick={onDone}>{copy.close}</button>
      </div>
    </div>
  );
}
