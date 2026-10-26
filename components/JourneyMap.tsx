"use client";

import { Check, Clock, Gift, Lock, Star, Trophy, Users } from "lucide-react";
import { chapterOf, chapterWeeks, journeyNodes, weeks } from "@/lib/content";
import type { journeyStateFor, JourneyStopState } from "@/lib/domain/rules";
import type { View } from "@/lib/domain/view";
import { useI18n } from "@/lib/i18n/client";
import { weekText } from "@/lib/i18n/content";
import BerripopMascot from "./berripop/BerripopMascot";

const WIDTH = 320;
const ROW = 108;
const OFFSETS = [0, 58, 88, 58, 0, -58, -88];

/** Which journey to draw: the built-in one (with circle members) or the member's goal journey. */
export type JourneyMapDef = {
  done: Record<number, string>;
  state: ReturnType<typeof journeyStateFor>;
  title: (day: number) => string;
  week: (week: number) => { theme: string; tagline: string; topics: string[] };
  /** Show circle members' progress and shared days (built-in journey in a circle). */
  shared: boolean;
  /** The weeks to draw: one chapter (default: the first). */
  weeks?: number[];
};

/**
 * A 21-day path (one chapter). Each stop shows your own state and, on the circle's shared
 * journey, how many members finished it and a badge once the whole circle has.
 */
export default function JourneyMap({ view, def, onOpen }: { view: View; def?: JourneyMapDef; onOpen: (day: number, state: JourneyStopState) => void }) {
  const { d, t } = useI18n();
  const map: JourneyMapDef = def ?? {
    done: view.myJourney, state: view.journey, title: day => d.journey.titles[day - 1], week: w => weekText(d, w), shared: !!view.circle,
    weeks: chapterWeeks(chapterOf(view.journey.next?.day ?? journeyNodes.length)),
  };
  const circle = map.shared ? view.circle : null;
  const total = circle?.members.length ?? 1;

  return (
    <div className="journey-map">
      {weeks.filter(w => (map.weeks ?? [1, 2, 3]).includes(w.week)).map(week => {
        const text = map.week(week.week);
        const nodes = journeyNodes.filter(n => n.week === week.week);
        const points = nodes.map((_, i) => ({ x: WIDTH / 2 + OFFSETS[i], y: ROW / 2 + i * ROW }));
        const milestoneY = ROW / 2 + nodes.length * ROW;
        const height = milestoneY + ROW / 2;
        const myWeekDone = nodes.every(n => map.done[n.day]);
        const sharedWeekDone = !!circle && nodes.every(n => circle.sharedJourney[n.day]);
        const doneCount = nodes.filter(n => map.done[n.day]).length;

        return (
          <section key={week.week} className={`journey-week tone-${week.tone}`} aria-label={t(d.journey.weekAria, { n: week.week, theme: text.theme })}>
            <header className="journey-week-banner">
              <div>
                <span className="eyebrow">{t(d.journey.weekLabel, { n: week.week })}</span>
                <h2>{text.theme}</h2>
                <p>{text.tagline}</p>
              </div>
              <div className="journey-week-count"><strong>{doneCount}</strong>/{nodes.length}</div>
              {text.topics.length > 0 && <ul className="journey-week-topics">{text.topics.map(topic => <li key={topic}>{topic}</li>)}</ul>}
            </header>

            <div className="journey-path" style={{ height, width: WIDTH }}>
              <svg width={WIDTH} height={height} className="journey-path-line" aria-hidden>
                {[...points, { x: WIDTH / 2, y: milestoneY }].slice(1).map((p, i, arr) => {
                  const prev = i === 0 ? points[0] : arr[i - 1];
                  const lit = i < nodes.length - 1 ? !!map.done[nodes[i + 1].day] : myWeekDone;
                  const midY = (prev.y + p.y) / 2;
                  return <path key={i} d={`M${prev.x} ${prev.y} C${prev.x} ${midY} ${p.x} ${midY} ${p.x} ${p.y}`} className={lit ? "is-lit" : ""} />;
                })}
              </svg>

              {nodes.map((n, i) => {
                const ns = map.state.stateOf(n.day);
                const p = points[i];
                const Icon = ns === "done" ? Check : ns === "tomorrow" ? Clock : ns === "locked" ? Lock : n.kind === "challenge" ? Gift : Star;
                const membersDone = circle ? circle.members.filter(m => circle.participation.journey[m.id]?.[n.day]).length : ns === "done" ? 1 : 0;
                const together = !!circle?.sharedJourney[n.day];
                const title = map.title(n.day);
                return (
                  <div key={n.id} className="journey-node-wrap" style={{ left: p.x, top: p.y }}>
                    {(ns === "current" || ns === "tomorrow") && (
                      <>
                        <span className={`journey-bubble ${ns === "tomorrow" ? "is-muted" : ""}`}>{ns === "current" ? d.journey.start : d.journey.tomorrow}</span>
                        <BerripopMascot size={54} mood={ns === "current" ? "happy" : "sleepy"} className={`journey-mascot ${OFFSETS[i] > 0 ? "on-left" : "on-right"}`} />
                      </>
                    )}
                    <button
                      type="button"
                      className={`journey-node is-${ns} ${n.kind === "challenge" ? "is-challenge" : ""} ${together ? "is-together" : ""}`}
                      onClick={() => onOpen(n.day, ns)}
                      aria-label={`${t(d.journey.nodeAria[ns], { day: n.day, topic: title })}${total > 1 ? `. ${t(d.dashboard.journeyMembers, { done: membersDone, total })}` : ""}${together ? `. ${d.journey.doneTogether}` : ""}`}
                    >
                      <Icon size={n.kind === "challenge" && ns !== "done" ? 28 : 26} strokeWidth={2.8} />
                      {together && <span className="together-badge" aria-hidden><Users size={11} strokeWidth={3} /></span>}
                    </button>
                    <span className="journey-node-label">
                      {t(d.journey.day, { n: n.day })}
                      {total > 1 && membersDone > 0 && <small className="member-count"> · {membersDone}/{total}</small>}
                    </span>
                  </div>
                );
              })}

              <div className="journey-node-wrap" style={{ left: WIDTH / 2, top: milestoneY }}>
                <div className={`journey-milestone ${sharedWeekDone ? "is-done" : myWeekDone ? "is-mine" : ""}`}>
                  <Trophy size={22} strokeWidth={2.6} />
                  <span>{sharedWeekDone && week.week <= 3 ? d.gamification.milestones[`shared-week-${week.week}` as "shared-week-1"].done : myWeekDone || sharedWeekDone ? t(d.journey.weekDone, { n: week.week }) : t(d.journey.milestone, { theme: text.theme })}</span>
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
