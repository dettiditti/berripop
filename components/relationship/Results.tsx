"use client";

import { useState } from "react";
import { ArrowLeft, Check, MessageCircleHeart, RotateCcw, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { ATTACHMENT_AREAS, ATTACHMENT_PATTERNS, LOVE_LANGUAGES, type AttachmentPattern, type AttachmentRecordDTO, type LoveLanguage, type LoveLanguageRecordDTO, type LoveLanguageScores, type RelationshipError, type RelationshipReflection } from "@/lib/relationship/types";
import { relationshipReflectionAction } from "@/lib/server/actions";
import { BerriStill } from "../berripop/BerriVideo";
import { Bar, LockedPreview, PremiumBadge, QuotaNote, RelError, useRel, useRelCopy } from "./shared";

export const LANG_TONE: Record<LoveLanguage, string> = { words: "purple", time: "sky", gifts: "sun", acts: "mint", touch: "coral" };
const PATTERN_TONE: Record<AttachmentPattern, string> = { secure: "mint", anxious: "coral", avoidant: "sky", fearful: "purple" };

const sortedLangs = (s: LoveLanguageScores) => [...LOVE_LANGUAGES].sort((a, b) => s[b] - s[a]);

export function LangBars({ scores, label }: { scores: LoveLanguageScores; label: string }) {
  const c = useRelCopy();
  return (
    <div className="rel-bars">
      <h3>{label}</h3>
      <ul>
        {sortedLangs(scores).map(l => (
          <li key={l}>
            <span className="rel-bars-name">{c.love.langs[l].name}</span>
            <Bar value={scores[l]} tone={LANG_TONE[l]} label={`${c.love.langs[l].name}: ${scores[l]}%`} />
            <strong className="tabular">{scores[l]}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The personal AI reflection: shown when there is one, offered to Premium, previewed to Free. */
function ReflectionBlock({ recordId, reflection }: { recordId: string; reflection: RelationshipReflection | null }) {
  const c = useRelCopy();
  const r = c.reflection;
  const { state, setState, paywall } = useRel();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RelationshipError | null>(null);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const res = await relationshipReflectionAction(recordId);
      if (res.ok) setState(res.state);
      else if (res.error === "premium_required") paywall("reflection");
      else setError(res.error);
    } catch {
      setError("ai_failed");
    }
    setBusy(false);
  }

  if (reflection) {
    return (
      <section className="card rel-premium-card rel-reflection" aria-labelledby="rel-reflection-title">
        <div className="rel-premium-head"><PremiumBadge label={c.premiumBadge} /><h2 id="rel-reflection-title">{r.title}</h2></div>
        <p className="rel-reflection-summary">{reflection.summary}</p>
        <ReflectionList title={r.strengths} items={reflection.strengths} />
        <ReflectionList title={r.tender} items={reflection.tender} />
        <ReflectionList title={r.tryThis} items={reflection.tryThis} />
        <p className="muted rel-small">{r.note}</p>
      </section>
    );
  }
  if (!state.premium) {
    return (
      <section className="card rel-premium-card" aria-labelledby="rel-reflection-title">
        <div className="rel-premium-head"><PremiumBadge label={c.premiumBadge} /><h2 id="rel-reflection-title">{r.title}</h2></div>
        <LockedPreview feature="reflection">
          <p className="rel-reflection-summary">{r.sample.summary}</p>
          <ReflectionList title={r.strengths} items={r.sample.strengths} />
          <ReflectionList title={r.tryThis} items={r.sample.tryThis} />
        </LockedPreview>
      </section>
    );
  }
  return (
    <section className="card rel-premium-card" aria-labelledby="rel-reflection-title">
      <div className="rel-premium-head"><PremiumBadge label={c.premiumBadge} /><h2 id="rel-reflection-title">{r.title}</h2></div>
      <p className="muted">{r.body}</p>
      <button type="button" className="btn btn--premium btn--block" disabled={busy || !state.aiConfigured || state.quota.remaining <= 0} aria-busy={busy} onClick={() => void ask()}>
        <Sparkles size={16} aria-hidden /> {busy ? r.thinking : r.cta}
      </button>
      <QuotaNote />
      <p className="muted rel-small">{r.note}</p>
      <RelError error={error} />
    </section>
  );
}

function ReflectionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rel-reflection-list">
      <h3>{title}</h3>
      <ul>{items.map(x => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}

function ResultHead({ title, date, retestFrom, onBack, onRetake }: { title: string; date: string; retestFrom: string | null; onBack: () => void; onRetake: () => void }) {
  const c = useRelCopy();
  const { date: fmt } = useI18n();
  return (
    <>
      <button type="button" className="btn btn--text world-back" onClick={onBack}><ArrowLeft size={16} /> {c.back}</button>
      <header className="page-head rel-result-head">
        <div>
          <span className="eyebrow">{c.name}</span>
          <h1>{title}</h1>
          <p className="muted">{c.takenOn(fmt(date.slice(0, 10), "long"))}</p>
        </div>
        {retestFrom ? (
          <small className="muted rel-retest-note">{c.retakeFrom(fmt(retestFrom, "long"))}</small>
        ) : (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onRetake}><RotateCcw size={15} /> {c.retake}</button>
        )}
      </header>
    </>
  );
}

export function LoveLanguageResultView({ record, onBack, onRetake }: { record: LoveLanguageRecordDTO; onBack: () => void; onRetake: () => void }) {
  const c = useRelCopy();
  const l = c.love;
  const { state } = useRel();
  const { result, detail } = record;
  const top = result.top.map(x => l.langs[x]);
  const first = result.top[0];
  return (
    <div className="stack rel-result">
      <ResultHead title={l.resultTitle} date={record.createdAt} retestFrom={state.retest.love} onBack={onBack} onRetake={onRetake} />

      <section className={`card rel-hero tone-${LANG_TONE[first]}`}>
        <BerriStill pose="joy" className="rel-hero-berri" />
        <div>
          <p className="rel-hero-line">{top.length > 1 ? l.topTwo(top[0].name, top[1].name) : l.topOne(top[0].name)}</p>
          <p className="muted">{l.giveLine(l.langs[result.topGive].name)}</p>
        </div>
      </section>

      <section className="card rel-bars-card">
        <LangBars scores={result.receive} label={l.receiveLabel} />
        <LangBars scores={result.give} label={l.giveLabel} />
      </section>

      <section className="card stack-sm">
        <h2>{l.needsTitle}</h2>
        {result.top.map(x => (
          <div key={x} className={`rel-lang-note tone-${LANG_TONE[x]}`}>
            <strong>{l.langs[x].name} · <span className="muted">{l.langs[x].short}</span></strong>
            <p>{l.langs[x].feel}</p>
            <p>{l.langs[x].tip}</p>
          </div>
        ))}
      </section>

      <section className="card rel-premium-card stack-sm" aria-labelledby="rel-love-detail">
        <div className="rel-premium-head"><PremiumBadge label={c.premiumBadge} /><h2 id="rel-love-detail">{l.detailTitle}</h2></div>
        {detail ? (
          <>
            <h3>{l.gapTitle}</h3>
            {detail.gaps.length === 0 ? <p>{l.gapNone}</p> : (
              <ul className="rel-gap-list">
                {detail.gaps.map(g => (
                  <li key={g.lang}>
                    {g.give > g.receive ? l.gapMore(l.langs[g.lang].name) : l.gapLess(l.langs[g.lang].name)}
                    <span className="muted tabular"> ({g.give}% / {g.receive}%)</span>
                  </li>
                ))}
              </ul>
            )}
            {detail.mismatch && <p className="rel-callout">{l.mismatch}</p>}
            <h3>{l.drainedTitle}</h3>
            {result.top.map(x => <p key={x}><strong>{l.langs[x].name}:</strong> {l.langs[x].drained}</p>)}
            <h3>{l.howToAsk}</h3>
            {result.top.map(x => <p key={x} className="rel-quote"><MessageCircleHeart size={16} aria-hidden /> {l.langs[x].ask}</p>)}
          </>
        ) : (
          <>
            <p className="muted">{l.detailBody}</p>
            <LockedPreview feature="love_detail">
              <h3>{l.gapTitle}</h3>
              <p>{l.gapMore(l.langs.acts.name)}</p>
              <p>{l.gapLess(l.langs.time.name)}</p>
              <p className="rel-quote">{l.langs.time.ask}</p>
            </LockedPreview>
          </>
        )}
      </section>

      <ReflectionBlock recordId={record.id} reflection={record.reflection} />
      <p className="muted rel-small">{c.disclaimer}</p>
    </div>
  );
}

/** The two dimensions as a small map: where the member's answers sit, never a box they are put in. */
function AttachmentMap({ anxiety, avoidance }: { anxiety: number; avoidance: number }) {
  const c = useRelCopy();
  const a = c.attach;
  return (
    <figure className="rel-map" aria-label={`${a.axisAnxiety}: ${anxiety}/100, ${a.axisAvoidance}: ${avoidance}/100`}>
      <div className="rel-map-grid" aria-hidden>
        <span className="rel-map-q rel-map-q--anxious">{a.patterns.anxious.name}</span>
        <span className="rel-map-q rel-map-q--fearful">{a.patterns.fearful.name}</span>
        <span className="rel-map-q rel-map-q--secure">{a.patterns.secure.name}</span>
        <span className="rel-map-q rel-map-q--avoidant">{a.patterns.avoidant.name}</span>
        <i className="rel-map-dot" style={{ left: `${avoidance}%`, bottom: `${anxiety}%` }} />
      </div>
      <figcaption>
        <span>↑ {a.axisAnxiety}</span>
        <span>{a.axisAvoidance} →</span>
      </figcaption>
    </figure>
  );
}

export function AttachmentResultView({ record, onBack, onRetake }: { record: AttachmentRecordDTO; onBack: () => void; onRetake: () => void }) {
  const c = useRelCopy();
  const a = c.attach;
  const { state } = useRel();
  const { result, detail } = record;
  const order = [...ATTACHMENT_PATTERNS].sort((x, y) => result.leaning[y] - result.leaning[x]);
  const focus = result.main ?? order[0];
  const needs = result.main ? a.needs[result.main] : [...a.needs[order[0]].slice(0, 2), ...a.needs[order[1]].slice(0, 1)];
  return (
    <div className="stack rel-result">
      <ResultHead title={a.resultTitle} date={record.createdAt} retestFrom={state.retest.attachment} onBack={onBack} onRetake={onRetake} />

      <section className={`card rel-hero tone-${PATTERN_TONE[focus]}`}>
        <BerriStill pose={result.main === "secure" ? "calm" : "care"} className="rel-hero-berri" />
        <div>
          <p className="rel-hero-line">{result.main ? a.mainLine(a.patterns[result.main].name) : a.mixedLine}</p>
          <p className="muted">{a.patterns[focus].short}</p>
        </div>
      </section>

      <section className="card stack-sm">
        <AttachmentMap anxiety={result.anxiety} avoidance={result.avoidance} />
        <div className="rel-bars">
          <h3>{a.leaningTitle}</h3>
          <ul>
            {order.map(p => (
              <li key={p}>
                <span className="rel-bars-name">{a.patterns[p].name}</span>
                <Bar value={result.leaning[p]} tone={PATTERN_TONE[p]} label={`${a.patterns[p].name}: ${result.leaning[p]}%`} />
                <strong className="tabular">{result.leaning[p]}%</strong>
              </li>
            ))}
          </ul>
        </div>
        <p>{a.patterns[focus].body}</p>
        {result.borderline && <p className="rel-callout">{a.borderline}</p>}
        <p className="muted rel-small">{a.notLabel}</p>
      </section>

      <section className="card stack-sm">
        <h2>{a.needsTitle}</h2>
        <ul className="rel-check-list">{needs.map(n => <li key={n}><Check size={16} strokeWidth={3} aria-hidden /> {n}</li>)}</ul>
      </section>

      <section className="card rel-premium-card stack-sm" aria-labelledby="rel-attach-detail">
        <div className="rel-premium-head"><PremiumBadge label={c.premiumBadge} /><h2 id="rel-attach-detail">{a.detailTitle}</h2></div>
        {detail ? (
          <>
            <div className="rel-bars">
              <h3>{a.areasTitle}</h3>
              <ul>
                {ATTACHMENT_AREAS.map(ar => (
                  <li key={ar}>
                    <span className="rel-bars-name">{a.areas[ar]}</span>
                    <Bar value={detail.areas[ar]} tone={detail.tender.includes(ar) ? "coral" : detail.steady.includes(ar) ? "mint" : "purple"} label={`${a.areas[ar]}: ${detail.areas[ar]}/100`} />
                    <strong className="tabular">{detail.areas[ar]}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <p><strong>{a.tenderTitle}:</strong> {detail.tender.map(x => a.areas[x]).join(", ")}</p>
            <p><strong>{a.steadyTitle}:</strong> {detail.steady.map(x => a.areas[x]).join(", ")}</p>
            <h3>{a.conflictTitle}</h3>
            <p>{a.patterns[focus].conflict}</p>
            <h3>{a.growthTitle}</h3>
            <p>{a.patterns[focus].growth}</p>
          </>
        ) : (
          <>
            <p className="muted">{a.detailBody}</p>
            <LockedPreview feature="attachment_detail">
              <div className="rel-bars">
                <ul>
                  {ATTACHMENT_AREAS.slice(0, 4).map((ar, i) => (
                    <li key={ar}><span className="rel-bars-name">{a.areas[ar]}</span><Bar value={[72, 38, 55, 24][i]} tone={i === 0 ? "coral" : "purple"} /><strong className="tabular">{[72, 38, 55, 24][i]}</strong></li>
                  ))}
                </ul>
              </div>
              <p><strong>{a.conflictTitle}:</strong> {a.patterns.anxious.conflict}</p>
            </LockedPreview>
          </>
        )}
      </section>

      <ReflectionBlock recordId={record.id} reflection={record.reflection} />
      <p className="muted rel-small">{c.disclaimer}</p>
    </div>
  );
}
