"use client";

import { useState } from "react";
import { Crown, Heart, Lock, LogOut, MessageCircle, Plus, Route, ShieldCheck, Trophy, UserMinus, UserPlus } from "lucide-react";
import { milestoneDefs } from "@/lib/domain/rules";
import { useI18n } from "@/lib/i18n/client";
import {
  createCircleAction, joinCircleAction, leaveCircleAction, removeMemberAction, renameCircleAction, switchCircleAction,
} from "@/lib/server/actions";
import { PLAN_LIMITS } from "@/lib/billing/plans";
import BerripopMascot from "../berripop/BerripopMascot";
import UpgradePrompt from "../billing/UpgradePrompt";
import Feed from "../Feed";
import { Confirm } from "../Modals";
import type { ScreenProps } from "./types";

export default function CircleScreen({ view, run, notify, go, openQuestion, onInvite, openJourney }: ScreenProps) {
  const { d, t } = useI18n();
  const c = d.circle;
  const { circle, facts } = view;
  const [name, setName] = useState(circle?.name ?? "");
  const [newName, setNewName] = useState("");
  const [code, setCode] = useState("");
  // Közös út without a circle shows the setup instead (see the app shell).
  if (!circle) return null;
  const isOwner = circle.role === "owner";

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <span className="eyebrow">{c.eyebrow}</span>
          <h1>{circle.name}</h1>
          <p>{c.intro}</p>
          <button className="btn btn--ghost btn--sm" onClick={() => openJourney("shared")}><Route size={16} /> {d.journey.sharedLink}</button>
        </div>
      </header>

      <section className="card members">
        <BerripopMascot pair mood={circle.members.length > 1 ? "excited" : "curious"} size={72} className="members-art" />
        <ul className="member-list">
          {circle.members.map(m => (
            <li key={m.id}>
              <span className="avatar tone-purple">{(m.name || d.common.you)[0]?.toUpperCase()}</span>
              <span>
                <strong>{m.name || d.common.you}{m.isMe && ` (${d.common.you})`}</strong>
                <small>{m.role === "owner" ? <><Crown size={12} /> {c.owner}</> : null}</small>
              </span>
              {isOwner && !m.isMe && (
                <Confirm
                  label={c.remove}
                  icon={<UserMinus size={14} />}
                  question={t(c.removeConfirm, { name: m.name })}
                  yes={c.removeYes}
                  onConfirm={async () => { if (await run(removeMemberAction(circle.id, m.id))) notify(c.removed); }}
                />
              )}
            </li>
          ))}
        </ul>
        <button className="btn btn--coral btn--block" onClick={onInvite}><UserPlus size={18} /> {c.invite}</button>
      </section>

      {isOwner && (
        <section className="card stack-sm">
          <label className="field-label" htmlFor="circle-rename">{c.renameLabel}</label>
          <div className="own-word-row">
            <input id="circle-rename" className="input" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
            <button className="btn btn--ghost btn--sm" disabled={name.trim().length < 2 || name === circle.name} onClick={async () => { if (await run(renameCircleAction(circle.id, name))) notify(c.renamed); }}>{c.save}</button>
          </div>
        </section>
      )}

      <section className="stack-sm">
        <div className="section-head"><div><span className="eyebrow">{c.milestonesEyebrow}</span><h2>{c.milestonesTitle}</h2></div></div>
        <ul className="milestone-list">
          {milestoneDefs.map(m => {
            const done = view.milestoneIds.has(m.id);
            const current = Math.min(m.target, m.metric(facts));
            const text = d.gamification.milestones[m.id];
            const solo = circle.members.length < 2;
            return (
              <li key={m.id} className={`card milestone ${done ? "is-done" : ""} ${solo && !done ? "is-locked" : ""}`}>
                <span className="milestone-icon">{done ? <Trophy size={20} /> : solo ? <Lock size={18} /> : <Heart size={20} />}</span>
                <div>
                  <strong>{done ? text.done : text.title}</strong>
                  {!done && (solo ? <small>{c.milestoneLocked}</small> : m.target > 1 ? <div className="bar bar--thin"><span style={{ width: `${(current / m.target) * 100}%` }} /></div> : null)}
                </div>
                {!done && !solo && m.target > 1 && <span className="milestone-count tabular">{current}/{m.target}</span>}
              </li>
            );
          })}
        </ul>
      </section>

      {circle.feed.length > 0 && (
        <section className="stack-sm">
          <span className="eyebrow">{d.dashboard.feedTitle}</span>
          <Feed view={view} events={circle.feed} onOpen={openQuestion} />
        </section>
      )}

      <section className="card stack-sm">
        <h2>{c.yourCircles}</h2>
        <ul className="circle-switch">
          {view.snapshot.circles.map(x => (
            <li key={x.id}>
              <span>{x.name}</span>
              {x.id === circle.id ? <span className="tag">{c.current}</span> : (
                <button className="btn btn--text btn--inline" onClick={async () => { if (await run(switchCircleAction(x.id))) go("home"); }}>{c.switchTo}</button>
              )}
            </li>
          ))}
        </ul>
        <label className="field-label" htmlFor="new-circle">{c.createAnother}</label>
        {view.snapshot.account.entitlements.plan === "free" && view.snapshot.account.ownedCircles >= view.snapshot.account.entitlements.limits.ownedCircles && (
          <UpgradePrompt kind="circles" vars={{ n: PLAN_LIMITS.premium.ownedCircles }} />
        )}
        <div className="own-word-row">
          <input id="new-circle" className="input" value={newName} maxLength={60} placeholder={d.onboarding.namePlaceholder} onChange={e => setNewName(e.target.value)} />
          <button className="btn btn--ghost btn--sm" disabled={newName.trim().length < 2} onClick={async () => { if (await run(createCircleAction(newName))) { setNewName(""); go("home"); } }}><Plus size={16} /></button>
        </div>
        <label className="field-label" htmlFor="join-code">{c.joinAnother}</label>
        <div className="own-word-row">
          <input id="join-code" className="input input--code" value={code} maxLength={12} placeholder={d.onboarding.codePlaceholder} onChange={e => setCode(e.target.value.toUpperCase())} />
          <button className="btn btn--ghost btn--sm" disabled={code.trim().length < 6} onClick={async () => { if (await run(joinCircleAction(code))) { setCode(""); notify(d.invite.joined); go("home"); } }}>{d.onboarding.join}</button>
        </div>
        {!isOwner && (
          <Confirm
            label={c.leave}
            icon={<LogOut size={14} />}
            question={c.leaveConfirm}
            yes={c.leaveYes}
            onConfirm={async () => { if (await run(leaveCircleAction(circle.id))) { notify(c.left); go("home"); } }}
          />
        )}
      </section>

      <section className="principles">
        <div className="card principle"><ShieldCheck size={22} /><strong>{c.principles.privateTitle}</strong><p>{c.principles.privateBody}</p></div>
        <div className="card principle"><Heart size={22} /><strong>{c.principles.competitionTitle}</strong><p>{c.principles.competitionBody}</p></div>
        <div className="card principle"><MessageCircle size={22} /><strong>{c.principles.skipTitle}</strong><p>{c.principles.skipBody}</p></div>
      </section>
    </div>
  );
}
