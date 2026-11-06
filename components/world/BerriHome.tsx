"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, HeartHandshake, Info, Sparkles, Star } from "lucide-react";
import { appetiteOf, MEALS_PER_DAY, type Hunger, type Meal } from "@/lib/berriHunger";
import type { View } from "@/lib/domain/view";
import { useI18n } from "@/lib/i18n/client";
import { hapticSuccess } from "@/lib/nativeBridge";
import { deriveWorld } from "@/lib/world";
import type { BerripopMood } from "../berripop/BerripopMascot";
import BerriVideo, { type BerriClip } from "../berripop/BerriVideo";
import BerripopSpeechBubble from "../berripop/BerripopSpeechBubble";
import WorldScene from "./WorldScene";

const MOOD: Record<Hunger, BerripopMood> = { full: "proud", peckish: "curious", hungry: "encouraging", missing: "happy" };
/** Berri's clip for each appetite: munching happily when full, patting a rumbling tummy when hungry. */
const CLIP: Record<Hunger, BerriClip> = { full: "joy", peckish: "peckish", hungry: "hungry", missing: "missed" };
const ICON = { question: Sparkles, checkin: HeartHandshake, moment: Star } as const;

const SEEN = "berripop.berriBites";
/** About as long as the "eat" clip (a star drops in and Berri munches it). */
const FEED_MS = 4200;

/** How many bites the member has already watched Berri eat today (this phone only). */
function seenBites(today: string): number {
  try {
    const v = JSON.parse(window.localStorage.getItem(SEEN) ?? "null") as { date?: unknown; n?: unknown } | null;
    return v && v.date === today && typeof v.n === "number" ? v.n : 0;
  } catch {
    return 0;
  }
}
function markSeen(today: string, n: number) {
  try {
    window.localStorage.setItem(SEEN, JSON.stringify({ date: today, n }));
  } catch {
    // Blocked storage: Berri may eat the same bite again next time, which is harmless.
  }
}

/** What Berri has eaten, for the Today card and the inner world. */
export function useAppetite(view: View) {
  const p = view.snapshot.progress;
  return useMemo(
    () =>
      appetiteOf(
        {
          questionDates: view.facts.myActiveDates,
          checkinDates: [...p.moods.map(m => m.date), ...(p.checkin ? [p.checkin.date] : [])],
          momentDates: p.moments.map(m => m.date),
        },
        view.today,
      ),
    [view.facts.myActiveDates, p.moods, p.checkin, p.moments, view.today],
  );
}

/**
 * The top of Today: Berri in the member's own little world, how hungry Berri
 * is, and the three ways to feed Berri (a question, a check-in, a moment).
 * Tapping the world opens My Inner World. Once Berri has eaten today, the
 * usual greeting (streak, welcome back…) takes over the speech bubble.
 */
export default function BerriHome({ view, onWorld, onFeed, fullMessage, covered = false }: { view: View; onWorld: () => void; onFeed: (meal: Meal) => void; fullMessage?: string; covered?: boolean }) {
  const { d, t } = useI18n();
  const b = d.berriHome;
  const appetite = useAppetite(view);
  const world = useMemo(() => deriveWorld(view, view.snapshot.progress.moments), [view]);
  const eaten = new Set(appetite.mealsToday);
  const full = eaten.size >= MEALS_PER_DAY;
  const bites = eaten.size;

  // A new bite since the member last looked: once nothing covers Today any more, Berri eats it
  // (the "eat" clip: a star drops in and Berri munches it; "Yum!", and the new dot lights up).
  const [feeding, setFeeding] = useState(false);
  const [replay, setReplay] = useState(0);
  // After eating, Berri stays on the eating clip's happy last frame instead of starting another clip.
  const [ate, setAte] = useState(false);
  useEffect(() => {
    if (covered) return;
    const seen = seenBites(view.today);
    markSeen(view.today, bites);
    if (bites <= seen) return;
    setFeeding(true);
    setAte(true);
    setReplay(r => r + 1);
    hapticSuccess();
  }, [covered, bites, view.today]);
  const clip: BerriClip = ate ? "eat" : CLIP[appetite.hunger];
  useEffect(() => {
    if (!feeding) return;
    const t = window.setTimeout(() => setFeeding(false), FEED_MS);
    return () => window.clearTimeout(t);
  }, [feeding, replay]);

  return (
    <section className={`card berri-home is-${appetite.hunger} ${feeding ? "is-feeding" : ""}`} aria-labelledby="berri-home-title">
      <button type="button" className="berri-home-world" onClick={onWorld} aria-label={b.open}>
        <WorldScene world={world} label={d.innerWorld.homeBody} compact mood={MOOD[appetite.hunger]} berri={<BerriVideo key={`${clip}-${replay}`} clip={clip} className="world-berri-video" />} />
        <span className="berri-home-open pill">{b.open} <ArrowRight size={14} aria-hidden /></span>
      </button>
      <h2 id="berri-home-title" className="sr-only">{b.eyebrow}</h2>
      <BerripopSpeechBubble tail="top">{feeding ? b.yum : appetite.hunger === "full" && fullMessage ? fullMessage : b.hunger[appetite.hunger]}</BerripopSpeechBubble>
      <p className="berri-home-intro">{b.intro}</p>
      <div className="berri-bowl" aria-live="polite">
        <span className="berri-bowl-dots" aria-hidden>
          {Array.from({ length: MEALS_PER_DAY }, (_, i) => <i key={i} className={`${i < bites ? "is-on" : ""} ${feeding && i === bites - 1 ? "is-new" : ""}`} />)}
        </span>
        <span>{full ? b.bowlFull : t(b.bowl, { n: eaten.size, total: MEALS_PER_DAY })}</span>
      </div>
      <div className="berri-feed" role="group" aria-label={b.feedLabel}>
        {(["question", "checkin", "moment"] as const).map(meal => {
          const Icon = eaten.has(meal) ? Check : ICON[meal];
          return (
            <button
              key={meal}
              type="button"
              className={`berri-feed-btn ${eaten.has(meal) ? "is-eaten" : ""}`}
              onClick={() => onFeed(meal)}
              aria-label={eaten.has(meal) ? t(b.eaten, { meal: b.meals[meal] }) : b.meals[meal]}
            >
              <Icon size={18} strokeWidth={2.6} aria-hidden /> {b.meals[meal]}
            </button>
          );
        })}
      </div>
      <details className="berri-home-how">
        <summary><Info size={15} aria-hidden /> {b.howTitle}</summary>
        <ul>{b.how.map(line => <li key={line}>{line}</li>)}</ul>
      </details>
    </section>
  );
}
