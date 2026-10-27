"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock, Lightbulb, Lock, Sparkles, Users, X } from "lucide-react";
import { categoryTone, XP_RULES } from "@/lib/content";
import { berripopSays, moodFor, type MessageKey } from "@/lib/berripop-messages";
import { PLAN_LIMITS } from "@/lib/billing/plans";
import type { AccountDTO, AnswerContext, AnswerDTO } from "@/lib/domain/types";
import UpgradePrompt from "./billing/UpgradePrompt";
import { useI18n } from "@/lib/i18n/client";
import { questionPrompts, questionText } from "@/lib/i18n/content";
import type { Question } from "@/lib/types";
import BerripopMascot from "./berripop/BerripopMascot";
import BerripopReaction from "./berripop/BerripopReaction";
import BerripopSpeechBubble from "./berripop/BerripopSpeechBubble";
import ThemeGlyph from "./world/ThemeGlyph";

export type Draft = { text: string; reflection: string; prompt: string };

type Props = {
  question: Question;
  context: AnswerContext;
  existing?: AnswerDTO;
  draft?: Draft;
  /** Other circle members' names. Sharing needs at least one. */
  circleNames: string[];
  /** XP this save would earn, for the preview pill (0 = just for you). */
  xp: number;
  onDraft: (d: Draft) => void;
  onClose: () => void;
  onSave: (d: Draft, share: boolean) => Promise<void>;
  /** AI follow-up suggestions (metered on the server). */
  ai?: { account: AccountDTO; ask: (draft: string) => Promise<{ question: string } | { error: string }> };
};

/** Optional "Ask Berripop" follow-up. Never required; reaching the allowance never blocks writing. */
function AiFollowUp({ ai, draft, onUse }: { ai: NonNullable<Props["ai"]>; draft: string; onUse: (q: string) => void }) {
  const { d, t, plural, date } = useI18n();
  const a = d.aiAssist;
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const usage = ai.account.ai;

  if (!ai.account.aiConfigured) return null;

  async function ask() {
    setBusy(true);
    setError(null);
    const r = await ai.ask(draft);
    setBusy(false);
    if ("question" in r) setSuggestion(r.question);
    else setError(r.error);
  }

  const reached = usage.reached || error === "limit_ai";
  return (
    <div className="ai-follow-up">
      {suggestion ? (
        <div className="ai-suggestion">
          <span className="shared-progress-label">{a.result}</span>
          <p>{suggestion}</p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onUse(suggestion)}>{a.use}</button>
        </div>
      ) : !reached ? (
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={ask}>
          <Sparkles size={15} /> {busy ? a.working : a.button}
        </button>
      ) : null}
      {!reached && <small className="muted">{plural(a.remaining, usage.remaining)} · {a.disclosure}</small>}
      {error === "ai_unavailable" && <small className="field-hint">{a.unavailable}</small>}
      {error === "ai_consent_required" && <small className="field-hint">{a.consentRequired}</small>}
      {reached && (
        <>
          <small className="muted">{t(d.billing.prompts.ai.body, { date: date(usage.resets), n: PLAN_LIMITS.premium.aiPerPeriod })}</small>
          {ai.account.entitlements.plan === "free" && <UpgradePrompt kind="ai" vars={{ date: date(usage.resets), n: PLAN_LIMITS.premium.aiPerPeriod }} />}
        </>
      )}
    </div>
  );
}

type Step = "intro" | "write" | "save";

export default function QuestFlow({ question, context, existing, draft, circleNames, xp, onDraft, onClose, onSave, ai }: Props) {
  const { d, t, plural, date } = useI18n();
  const f = d.questions.flow;
  const [step, setStep] = useState<Step>(existing ? "write" : "intro");
  const [text, setText] = useState(draft?.text ?? existing?.text ?? "");
  const [reflection, setReflection] = useState(draft?.reflection ?? existing?.reflection ?? "");
  const [prompt, setPrompt] = useState(draft?.prompt ?? existing?.reflectionPrompt ?? "");
  const [share, setShare] = useState(!!existing?.shared);
  const [saving, setSaving] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const tone = categoryTone[question.category];
  const topic = d.themes[question.theme].name;
  const tagline = d.themes[question.theme].tagline;
  const text0 = questionText(question, d);
  const prompts = questionPrompts(question, d);
  const canShare = circleNames.length > 0;
  const alreadyShared = !!existing?.shared;
  const ready = text.trim().length >= 2;
  // Berripop reacts to effort only, never to what the answer says.
  const writeKey: MessageKey = reflection.trim() ? "quest.deeper" : text.trim() ? "quest.writing" : "quest.empty";
  const label =
    context.kind === "journey" || context.kind === "goal"
      ? t(f.dayQuest, { day: context.day })
      : context.kind === "daily"
        ? canShare ? d.dashboard.dailyEyebrow : d.today.ownDailyEyebrow
        : f.bonus;

  useEffect(() => {
    overlayRef.current?.scrollTo({ top: 0 });
    if (step === "write") textRef.current?.focus();
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function close() {
    if (!existing) onDraft({ text, reflection, prompt });
    onClose();
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({ text, reflection: prompt ? reflection : "", prompt }, share);
    } finally {
      setSaving(false);
    }
  }

  const steps: Step[] = ["intro", "write", "save"];

  return (
    <div ref={overlayRef} className={`overlay quest-flow tone-${tone}`} role="dialog" aria-modal="true" aria-label={f.dialogLabel}>
      <header className="quest-flow-top">
        <button className="icon-btn" onClick={step === "save" ? () => setStep("write") : close} aria-label={step === "save" ? d.common.back : d.common.close}>
          {step === "save" ? <ArrowLeft size={22} /> : <X size={22} />}
        </button>
        <div className="quest-steps" aria-hidden>
          {steps.map((s, i) => <i key={s} className={steps.indexOf(step) >= i ? "on" : ""} />)}
        </div>
        <span className="pill pill--sun"><Sparkles size={14} /> {xp ? t(d.common.plusXp, { n: xp }) : d.common.justForYou}</span>
      </header>

      {step === "intro" && (
        <div className="quest-flow-body quest-intro" key="intro">
          <BerripopMascot mood="curious" size={132} motion="lively" className="quest-intro-mascot" />
          <BerripopSpeechBubble tail="top">{berripopSays(d, "quest.intro", question.id)}</BerripopSpeechBubble>
          <span className="eyebrow">{label} · {topic}</span>
          <span className="theme-badge"><ThemeGlyph theme={question.theme} size={16} /> {tagline}</span>
          <h1 className="quest-intro-question">{text0}</h1>
          <p className="quest-meta"><Clock size={16} /> {plural(d.common.aboutMinutes, question.minutes)} · {f.noWrong}</p>
          <div className="quest-flow-actions">
            <button className="btn btn--primary btn--lg btn--block" onClick={() => setStep("write")}>{f.ready} <ArrowRight size={20} /></button>
            <button className="btn btn--text" onClick={close}>{f.later}</button>
          </div>
        </div>
      )}

      {step === "write" && (
        <div className="quest-flow-body quest-write" key="write">
          <span className="eyebrow">{topic}</span>
          <h1 className="quest-write-question">{text0}</h1>
          {existing && <p className="note"><Check size={15} /> {t(f.answeredOn, { date: date(existing.date) })}</p>}
          <label className="sr-only" htmlFor="answer">{f.answerLabel}</label>
          <textarea
            id="answer"
            ref={textRef}
            className="answer-box"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={f.placeholder}
            aria-describedby="answer-hint"
            rows={6}
            maxLength={2000}
          />
          <div className="answer-hint" id="answer-hint"><Lock size={13} /> {d.privacy.answerHint}</div>
          <BerripopReaction mood={moodFor[writeKey]} message={berripopSays(d, writeKey, question.id)} size={52} className="quest-reaction" />

          <div className="nudges">
            <span className="nudges-title"><Lightbulb size={16} /> {f.deeperTitle} <em>{context.kind !== "bonus" && !existing?.reflection ? t(f.optionalXp, { n: XP_RULES.reflection }) : f.optional}</em></span>
            <div className="chip-row">
              {prompts.map(p => (
                <button key={p} type="button" className={`chip ${prompt === p ? "is-active" : ""}`} onClick={() => setPrompt(prompt === p ? "" : p)} aria-pressed={prompt === p}>
                  {p}
                </button>
              ))}
            </div>
            {prompt && (
              <textarea className="answer-box answer-box--small" aria-label={prompt} value={reflection} onChange={e => setReflection(e.target.value)} placeholder={prompt} rows={3} maxLength={1000} />
            )}
            {ai && <AiFollowUp ai={ai} draft={text} onUse={q => setPrompt(q)} />}
          </div>

          <div className="quest-flow-actions">
            {!ready && text.length > 0 && <p className="field-hint" role="status">{d.validation.answerTooShort}</p>}
            <button className="btn btn--primary btn--lg btn--block" disabled={!ready} onClick={() => setStep("save")}>
              {d.common.continue} <ArrowRight size={20} />
            </button>
          </div>
        </div>
      )}

      {step === "save" && (
        <div className="quest-flow-body quest-save" key="save">
          <BerripopReaction mood="happy" message={berripopSays(d, "quest.save", question.id)} size={88} layout="stack" />
          <h1>{f.saveTitle}</h1>
          <p className="muted">{f.saveSubtitle}</p>
          <div className="choice-list" role="radiogroup" aria-label={f.visibility}>
            <button type="button" role="radio" aria-checked={!share} disabled={alreadyShared} className={`choice ${!share ? "is-active" : ""}`} onClick={() => setShare(false)}>
              <span className="choice-icon tone-purple"><Lock size={22} /></span>
              <span><strong>{f.justMe}</strong><small>{f.justMeBody}</small></span>
            </button>
            <button type="button" role="radio" aria-checked={share} disabled={!canShare} className={`choice ${share ? "is-active" : ""}`} onClick={() => setShare(true)}>
              <span className="choice-icon tone-coral"><Users size={22} /></span>
              <span>
                <strong>{f.withCircle}</strong>
                <small>{alreadyShared ? f.alreadyShared : canShare ? t(f.circleCanRead, { names: circleNames.join(", ") }) : f.inviteToShare}</small>
              </span>
            </button>
          </div>
          <div className="quest-flow-actions">
            <button className="btn btn--primary btn--lg btn--block" disabled={saving} onClick={save}>
              {existing ? f.saveChanges : share ? f.saveShare : f.saveAnswer} <Check size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
