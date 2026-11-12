"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, HeartHandshake, Info, Sparkles, Star } from "lucide-react";
import { addDays } from "@/lib/dates";
import { appetiteOf, MEALS_PER_DAY, type Hunger, type Meal } from "@/lib/berriHunger";
import type { View } from "@/lib/domain/view";
import { useI18n } from "@/lib/i18n/client";
import { hapticSuccess, widgetUpdate } from "@/lib/nativeBridge";
import { deriveWorld } from "@/lib/world";
import { wornHeadItem } from "@/lib/wardrobe";
import type { BerripopMood } from "../berripop/BerripopMascot";
import { BerriStill, type BerriPose } from "../berripop/BerriVideo";
import BerripopSpeechBubble from "../berripop/BerripopSpeechBubble";
import WorldScene from "./WorldScene";

const MOOD: Record<Hunger, BerripopMood> = { full: "proud", peckish: "curious", hungry: "encouraging", missing: "happy" };
/** Berri's pose for each appetite: happy when full, dreaming of a snack when peckish, holding a rumbling tummy when hungry. */
const POSE: Record<Hunger, BerriPose> = { full: "joy", peckish: "peckish", hungry: "hungry", missing: "missed" };
const ICON = { question: Sparkles, checkin: HeartHandshake, moment: Star } as const;

const SEEN = "berripop.berriBites";
/** How long Berri shows the "eat" pose (munching the star) after a new bite. */
const FEED_MS = 4200;
/** Once Berri is fed, another contented pose now and then, so Berri never looks frozen. */
const IDLE: BerriPose[] = ["calm", "joy", "wonder", "celebrate"];
const IDLE_MS = 11000;

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
  // (the "eat" pose: Berri munches a star; "Yum!", and the new dot lights up).
  const [feeding, setFeeding] = useState(false);
  const [replay, setReplay] = useState(0);
  // After eating, Berri keeps munching until the next contented pose comes round.
  const [ate, setAte] = useState(false);
  // Which contented pose Berri shows while resting after a meal (-1: still the meal itself).
  const [idle, setIdle] = useState(-1);
  useEffect(() => {
    if (covered) return;
    const seen = seenBites(view.today);
    markSeen(view.today, bites);
    if (bites <= seen) return;
    setFeeding(true);
    setAte(true);
    setIdle(-1);
    setReplay(r => r + 1);
    hapticSuccess();
  }, [covered, bites, view.today]);
  const resting = ate || appetite.hunger === "full";
  useEffect(() => {
    if (!resting || feeding || covered) return;
    const t = window.setInterval(() => setIdle(i => i + 1), IDLE_MS);
    return () => window.clearInterval(t);
  }, [resting, feeding, covered]);
  // What Berri wears from the treasure chest; the party-hat pose already has its own hat, so then plain joy instead.
  const wear = wornHeadItem(view.snapshot.wardrobe);
  const picked: BerriPose = resting && idle >= 0 ? IDLE[idle % IDLE.length] : ate ? "eat" : POSE[appetite.hunger];
  const pose: BerriPose = wear && picked === "celebrate" ? "joy" : picked;
  // The home-screen widget (iPhone app only) shows the same Berri, worked out by the date from here.
  const lastActive = useMemo(() => [...view.facts.myActiveDates].filter(x => x <= view.today).sort().pop() ?? null, [view.facts.myActiveDates, view.today]);
  useEffect(() => {
    const fed = appetite.daysSinceFed;
    widgetUpdate({
      date: view.today,
      lastFed: fed === null ? null : addDays(view.today, -fed),
      bites,
      streak: view.streak.current,
      lastActive,
      wear,
      text: b.hunger,
    });
  }, [view.today, appetite.daysSinceFed, bites, view.streak, lastActive, wear, b.hunger]);
  useEffect(() => {
    if (!feeding) return;
    const t = window.setTimeout(() => setFeeding(false), FEED_MS);
    return () => window.clearTimeout(t);
  }, [feeding, replay]);

  return (
    <section className={`card berri-home is-${appetite.hunger} ${feeding ? "is-feeding" : ""}`} aria-labelledby="berri-home-title">
      <button type="button" className="berri-home-world" onClick={onWorld} aria-label={b.open}>
        <WorldScene world={world} label={d.innerWorld.homeBody} compact mood={MOOD[appetite.hunger]} berri={<BerriStill key={`${pose}-${replay}-${idle}`} pose={pose} wear={wear} className="world-berri-video" />} />
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
