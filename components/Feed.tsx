"use client";

import { BookOpen, CheckCircle2, Flag, MessageSquarePlus, PartyPopper, Route, Sparkles, UserPlus } from "lucide-react";
import type { MilestoneId } from "@/lib/domain/rules";
import type { FeedEventDTO } from "@/lib/domain/types";
import type { View } from "@/lib/domain/view";
import { useI18n } from "@/lib/i18n/client";
import { dateOf } from "@/lib/domain/rules";

const ICONS = {
  circle_created: Sparkles,
  member_joined: UserPlus,
  daily_completed: CheckCircle2,
  journey_completed: Route,
  shared_journey_completed: PartyPopper,
  answer_shared: BookOpen,
  question_added: MessageSquarePlus,
  milestone_unlocked: Flag,
} as const;

const TONES = { circle_created: "purple", member_joined: "coral", daily_completed: "mint", journey_completed: "sky", shared_journey_completed: "sun", answer_shared: "coral", question_added: "purple", milestone_unlocked: "sun" } as const;

/**
 * Recent shared moments. Built only from recorded events; it never shows
 * answer text, only that something happened (and lets you open shared answers).
 */
export default function Feed({ view, events, onOpen }: { view: View; events: FeedEventDTO[]; onOpen: (ref: string) => void }) {
  const { d, t, relativeDay } = useI18n();
  const f = d.feed;
  const circle = view.circle;
  if (!circle) return null;
  const sharedById = new Map([...circle.sharedAnswers, ...circle.myAnswers.filter(a => a.shared)].map(a => [a.id, a.questionRef]));

  return (
    <ul className="recent-list card feed">
      {events.map(e => {
        const Icon = ICONS[e.type];
        const name = view.memberName(e.actorId);
        const text =
          e.type === "milestone_unlocked"
            ? t(f.milestone_unlocked, { milestone: d.gamification.milestones[e.ref as MilestoneId]?.title ?? e.ref })
            : t(f[e.type], { name, day: e.ref });
        const openRef = e.type === "answer_shared" ? sharedById.get(e.ref) : e.type === "question_added" ? e.ref : undefined;
        return (
          <li key={e.id}>
            <span className={`activity-icon tone-${TONES[e.type]}`}><Icon size={16} strokeWidth={2.4} /></span>
            <span className="recent-text">
              {text}
              <small>{relativeDay(dateOf(e.createdAt), view.today)}</small>
            </span>
            {openRef && <button className="btn btn--text btn--inline" onClick={() => onOpen(openRef)}>{f.read}</button>}
          </li>
        );
      })}
    </ul>
  );
}
