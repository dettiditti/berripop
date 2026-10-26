"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Lock, Users } from "lucide-react";
import { berripopSays, moodFor, type MessageKey } from "@/lib/berripop-messages";
import { achievementDefs, type MilestoneId } from "@/lib/domain/rules";
import type { RewardDTO } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { levelName } from "@/lib/i18n/content";
import { getLevelInfo } from "@/lib/progress";
import { decorForBadge, regionForWeek } from "@/lib/world";
import AchievementBadge from "../AchievementBadge";
import AnimatedNumber from "../AnimatedNumber";
import LevelBadge from "../LevelBadge";
import XPProgress from "../XPProgress";
import BerripopMascot from "./BerripopMascot";
import BerripopSpeechBubble from "./BerripopSpeechBubble";

const CONFETTI_COLORS = ["#7B4DFF", "#FF7A5C", "#2DD4A0", "#FFC93C", "#B796FF"];

function Confetti({ pieces }: { pieces: number }) {
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: pieces }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 9) * 60}ms`,
            animationDuration: `${1100 + ((i * 53) % 700)}ms`,
            transform: `rotate(${(i * 47) % 360}deg)`,
            borderRadius: i % 3 === 0 ? "50%" : "3px",
          }}
        />
      ))}
    </div>
  );
}

export type NextStep = { label: string; onClick: () => void };

type Props = {
  reward: RewardDTO;
  next: NextStep;
  canShare: boolean;
  onShare: () => void;
  onClose: () => void;
  onWorld: () => void;
  seed: string;
};

/** The completion screen: Berripop celebrates, XP counts up, progress fills. */
export default function BerripopCelebration({ reward, next, canShare, onShare, onClose, onWorld, seed }: Props) {
  const { d, t, num } = useI18n();
  const c = d.gamification.celebration;
  const closeRef = useRef<HTMLButtonElement>(null);
  const earned = reward.xpAfter - reward.xpBefore;
  const levelBefore = getLevelInfo(reward.xpBefore);
  const levelAfter = getLevelInfo(reward.xpAfter);
  const levelUp = levelAfter.level > levelBefore.level;
  const newBadges = achievementDefs.filter(a => reward.newAchievements.includes(a.id));
  const major = levelUp || newBadges.length > 0 || reward.weekCompleted !== null || reward.newMilestones.length > 0 || reward.sharedDayCompleted !== null;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const key: MessageKey = !reward.isNew ? "celebrate.edit" : levelUp ? "celebrate.levelUp" : reward.weekCompleted ? "celebrate.week" : "celebrate.default";
  const title = reward.weekCompleted ? t(c.weekDone, { n: reward.weekCompleted }) : !reward.isNew ? c.updated : c.done;

  const reasonLabel = (item: RewardDTO["xpItems"][number]) => {
    const r = d.gamification.xpReasons;
    if (item.reason === "new-topic") return t(r.newTheme, { theme: item.theme ? d.themes[item.theme as keyof typeof d.themes]?.name ?? "" : "" });
    if (item.reason === "reflection") return r.reflection;
    if (item.reason === "bonus") return r.bonus;
    if (item.reason === "weekly") return r.weekly;
    return r.daily;
  };

  return (
    <div className="overlay celebration" role="dialog" aria-modal="true" aria-labelledby="celebration-title">
      {reward.isNew && <Confetti pieces={major ? 44 : 16} />}
      <div className="celebration-card">
        <BerripopMascot mood={reward.isNew ? "excited" : moodFor[key]} size={116} motion="lively" className="celebration-mascot" />
        <BerripopSpeechBubble tail="top">{berripopSays(d, key, `${seed}:${reward.questionRef}`)}</BerripopSpeechBubble>
        <h2 id="celebration-title">
          {title}
          {earned > 0 && <span className="celebration-xp"> +<AnimatedNumber from={0} to={earned} /> XP</span>}
        </h2>

        {reward.xpItems.length > 0 ? (
          <ul className="xp-items">
            {reward.xpItems.map(item => <li key={item.reason}><span>{reasonLabel(item)}</span><strong>+{num(item.amount)}</strong></li>)}
          </ul>
        ) : (
          reward.isNew && <p className="muted">{c.noBonusXp}</p>
        )}

        <div className="celebration-progress">
          <XPProgress xp={reward.xpAfter} from={reward.xpBefore} />
        </div>

        {levelUp && (
          <div className="level-up">
            <LevelBadge level={levelAfter.level} size="lg" glow />
            <div>
              <strong>{c.levelUp}</strong>
              <span>{t(c.nowLevel, { name: levelName(d, levelAfter.level) })}</span>
            </div>
          </div>
        )}

        {(reward.sharedDayCompleted || reward.newMilestones.length > 0) && (
          <div className="level-up shared-win">
            <BerripopMascot pair mood="excited" size={44} motion="none" />
            <div>
              {reward.sharedDayCompleted && <strong>{t(c.sharedDay, { n: reward.sharedDayCompleted })}</strong>}
              {reward.newMilestones.map(id => <span key={id}>{t(c.milestone, { name: d.gamification.milestones[id as MilestoneId].done })}</span>)}
            </div>
          </div>
        )}

        {newBadges.length > 0 && (
          <div className="celebration-badges">
            <span className="eyebrow">{c.badgeUnlocked}</span>
            {newBadges.map(b => <AchievementBadge key={b.id} def={b} unlocked justUnlocked size="sm" />)}
          </div>
        )}

        {reward.isNew && (
          <button type="button" className="world-growth" onClick={onWorld}>
            <span className="world-growth-sprout" aria-hidden>
              <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 21 V12" stroke="#3FBF86" strokeWidth="2.2" strokeLinecap="round" /><path d="M12 14 q-6 0 -6 -6 q6 0 6 6" fill="#6EDCA6" /><path d="M12 12 q5 0 5 -5 q-5 0 -5 5" fill="#8BE6B8" /></svg>
            </span>
            <span>
              <strong>{c.growthTitle}</strong>
              <small>{c.growthSprout}</small>
              {reward.weekCompleted && <small>{t(c.growthRegion, { place: d.innerWorld.regions[regionForWeek[reward.weekCompleted - 1]].name })}</small>}
              {newBadges.map(b => <small key={b.id}>{t(c.growthDecor, { decor: d.innerWorld.decor[decorForBadge[b.id]] })}</small>)}
            </span>
            <span className="world-growth-cta">{c.nextWorld} <ArrowRight size={14} /></span>
          </button>
        )}

        <p className="celebration-privacy">
          {reward.shared ? <><Users size={14} /> {c.savedShared}</> : <><Lock size={14} /> {c.savedPrivate}</>}
        </p>

        <div className="celebration-actions">
          <button className="btn btn--primary btn--lg btn--block" onClick={next.onClick}>{next.label} <ArrowRight size={18} /></button>
          {!reward.shared && canShare && <button className="btn btn--ghost btn--block" onClick={onShare}><Users size={16} /> {c.shareOptional}</button>}
          <button ref={closeRef} className="btn btn--text" onClick={onClose}>{c.backHome}</button>
        </div>
      </div>
    </div>
  );
}
