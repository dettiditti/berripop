"use client";

import { useState } from "react";
import { ArrowRight, LogOut, Sparkles } from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import { XP_RULES } from "@/lib/content";
import { achievementDefs, SHARED_XP } from "@/lib/domain/rules";
import { useI18n } from "@/lib/i18n/client";
import { levelName } from "@/lib/i18n/content";
import { setDisplayNameAction } from "@/lib/server/actions";
import AchievementBadge from "../AchievementBadge";
import SubscriptionCard from "../billing/SubscriptionCard";
import WeeklySummaryCard from "../billing/WeeklySummaryCard";
import LanguageSelector from "../LanguageSelector";
import LevelBadge from "../LevelBadge";
import StreakIndicator from "../StreakIndicator";
import XPProgress from "../XPProgress";
import type { ScreenProps } from "./types";

export default function ProfileScreen({ view, run, notify, go }: ScreenProps) {
  const { d, t, num } = useI18n();
  const { signOut } = useClerk();
  const pr = d.profile;
  const { circle, facts } = view;
  const [name, setName] = useState(view.snapshot.me.name);
  const lvlName = levelName(d, view.level.level);
  const solo = !circle || circle.members.length < 2;
  const unlocked = achievementDefs.filter(a => view.achievementIds.has(a.id)).length;

  return (
    <div className="stack">
      <header className="profile-head card">
        <LevelBadge level={view.level.level} name={lvlName} size="lg" />
        <div className="profile-name">
          <label className="field-label" htmlFor="name">{pr.nameLabel}</label>
          <div className="own-word-row">
            <input id="name" className="input" value={name} placeholder={pr.namePlaceholder} onChange={e => setName(e.target.value)} maxLength={40} />
            <button className="btn btn--ghost btn--sm" disabled={!name.trim() || name === view.snapshot.me.name} onClick={async () => { if (await run(setDisplayNameAction(name))) notify(pr.nameSaved); }}>{d.circle.save}</button>
          </div>
          <span className="muted">{t(pr.summary, { level: view.level.level, name: lvlName, xp: num(view.xp) })}</span>
        </div>
      </header>

      <LanguageSelector onChanged={notify} persist />

      <SubscriptionCard account={view.snapshot.account} notify={notify} />
      <WeeklySummaryCard account={view.snapshot.account} circleId={circle?.id ?? null} notify={notify} />

      <div className="card card--tight"><XPProgress xp={view.xp} /></div>
      <StreakIndicator streak={view.streak} variant="card" />

      <section className="stack-sm">
        <div className="section-head">
          <div><span className="eyebrow">{pr.badgesEyebrow}</span><h2>{t(pr.badgesUnlocked, { n: unlocked, total: achievementDefs.length })}</h2></div>
        </div>
        <div className="badge-grid">
          {achievementDefs.map(def => {
            const isUnlocked = view.achievementIds.has(def.id);
            return (
              <AchievementBadge
                key={def.id}
                def={def}
                unlocked={isUnlocked}
                current={Math.min(def.target, def.metric(facts))}
                lockedHint={def.needsCircle && solo && !isUnlocked ? t(d.gamification.badgeNeedsCircle, { condition: d.gamification.badges[def.id].condition }) : undefined}
              />
            );
          })}
        </div>
      </section>

      <button type="button" className="card world-link lift" onClick={() => go("world")}>
        <Sparkles size={20} /> <span><strong>{d.innerWorld.title}</strong><small>{d.innerWorld.homeBody}</small></span> <ArrowRight size={18} />
      </button>

      <section className="card how-xp">
        <span className="eyebrow">{pr.howXpTitle}</span>
        <ul>
          <li><span>{pr.howXp.daily}</span><strong>+{XP_RULES.daily}</strong></li>
          <li><span>{pr.howXp.reflection}</span><strong>+{XP_RULES.reflection}</strong></li>
          <li><span>{pr.howXp.newTopic}</span><strong>+{XP_RULES.newTopic}</strong></li>
          <li><span>{pr.howXp.bonus}</span><strong>+{XP_RULES.bonus}</strong></li>
          <li><span>{pr.howXp.weekly}</span><strong>+{XP_RULES.weekly}</strong></li>
          <li><span>{pr.howXp.step}</span><strong>+{XP_RULES.step}</strong></li>
          <li><span>{pr.howXp.journal}</span><strong>+{XP_RULES.journal}</strong></li>
          {circle && <li><span>{d.dashboard.circleXp}: {d.journey.doneTogether}</span><strong>+{SHARED_XP.journeyTogether}</strong></li>}
        </ul>
        <p className="muted">{t(pr.howXpGrowthCap, { n: XP_RULES.growthDailyCap })} {pr.howXpNote}</p>
      </section>

      <button className="btn btn--ghost btn--block" onClick={() => signOut({ redirectUrl: "/" })}><LogOut size={18} /> {d.auth.signOut}</button>
    </div>
  );
}
