"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, CalendarHeart, MessageCircleQuestion, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { LOVE_LANGUAGES, type GrowthState, type GrowthWeek, type RelationshipError, type SummaryRecordDTO, type WeeklySummary } from "@/lib/relationship/types";
import { relationshipSummaryAction } from "@/lib/server/actions";
import { LANG_TONE } from "./Results";
import { Bar, LockedPreview, PremiumBadge, QuotaNote, RelError, useRel, useRelCopy } from "./shared";

/** One weekly summary: the overview, what Berri noticed, what changed, and one small step. */
function SummaryBody({ s }: { s: WeeklySummary }) {
  const g = useRelCopy().growth;
  return (
    <>
      <p className="rel-reflection-summary">{s.summary}</p>
      <div className="rel-reflection-list">
        <h3>{g.noticed}</h3>
        <ul>{s.noticed.map(x => <li key={x}>{x}</li>)}</ul>
      </div>
      <div className="rel-reflection-list">
        <h3>{g.progress}</h3>
        <p>{s.progress}</p>
      </div>
      <p className="rel-quote"><strong>{g.nextStep}:</strong> {s.nextStep}</p>
    </>
  );
}

/** The last four weeks as small columns: how many entries, and what came up most. */
function Weeks({ weeks, current }: { weeks: GrowthWeek[]; current: string }) {
  const c = useRelCopy();
  const g = c.growth;
  const { date } = useI18n();
  const max = Math.max(1, ...weeks.map(w => w.triggers + w.translations));
  const any = weeks.some(w => w.triggers + w.translations > 0);
  const last = [...weeks].reverse().find(w => w.topFeeling || w.topNeed);
  return (
    <section className="card stack-sm" aria-labelledby="rel-weeks-title">
      <h2 id="rel-weeks-title">{g.weeksTitle}</h2>
      {!any ? <p className="muted">{g.weeksEmpty}</p> : (
        <>
          <ol className="rel-weeks">
            {weeks.map(w => {
              const n = w.triggers + w.translations;
              return (
                <li key={w.week} className={w.week === current ? "is-now" : ""}>
                  <span className="rel-weeks-bar" aria-hidden><i style={{ height: `${Math.max(6, (n / max) * 100)}%` }} /></span>
                  <strong className="tabular">{n}</strong>
                  <small>{w.week === current ? g.thisWeek : date(w.start, "short")}</small>
                  <span className="sr-only">{g.weekOf(date(w.start, "short"))}: {g.entries(w.triggers)}, {g.translations(w.translations)}</span>
                </li>
              );
            })}
          </ol>
          {last && (
            <dl className="rel-weeks-top">
              {last.topFeeling && <div><dt>{g.topFeeling}</dt><dd>{c.feelings[last.topFeeling]}</dd></div>}
              {last.topNeed && <div><dt>{g.topNeed}</dt><dd>{c.needs[last.topNeed]}</dd></div>}
            </dl>
          )}
        </>
      )}
    </section>
  );
}

/** Earlier and current test results side by side (shown after a second test). */
function Compare({ growth }: { growth: GrowthState }) {
  const c = useRelCopy();
  const g = c.growth;
  const { state } = useRel();
  const { date } = useI18n();
  const love = state.loveLanguage;
  const attach = state.attachment;
  const pl = growth.previousLove;
  const pa = growth.previousAttachment;
  const delta = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return (
    <section className="card stack-sm" aria-labelledby="rel-compare-title">
      <h2 id="rel-compare-title">{g.compareTitle}</h2>
      {!(pl && love) && !(pa && attach) && <p className="muted">{g.compareEmpty}</p>}
      {pa && attach && (
        <div className="rel-bars">
          <h3>{c.attach.name} <small className="muted">{g.compareFrom(date(pa.createdAt.slice(0, 10), "short"), date(attach.createdAt.slice(0, 10), "short"))}</small></h3>
          <ul>
            {([[g.worry, pa.result.anxiety, attach.result.anxiety], [g.distance, pa.result.avoidance, attach.result.avoidance]] as const).map(([name, was, now]) => (
              <li key={name}>
                <span className="rel-bars-name">{name}</span>
                <Bar value={now} tone="sky" label={`${name}: ${was} → ${now}`} />
                <strong className="tabular">{now} <small className="muted rel-delta">({delta(now - was)})</small></strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pl && love && (
        <div className="rel-bars">
          <h3>{g.loveCompare} <small className="muted">{g.compareFrom(date(pl.createdAt.slice(0, 10), "short"), date(love.createdAt.slice(0, 10), "short"))}</small></h3>
          <ul>
            {[...LOVE_LANGUAGES].sort((a, b) => love.result.receive[b] - love.result.receive[a]).map(l => {
              const now = love.result.receive[l];
              const was = pl.result.receive[l];
              return (
                <li key={l}>
                  <span className="rel-bars-name">{c.love.langs[l].name}</span>
                  <Bar value={now} tone={LANG_TONE[l]} label={`${c.love.langs[l].name}: ${was}% → ${now}%`} />
                  <strong className="tabular">{now}% <small className="muted rel-delta">({delta(now - was)})</small></strong>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="muted rel-small">{g.retakeHint}</p>
    </section>
  );
}

/** This week's summary, or the way to ask for it. */
function SummaryCard({ growth }: { growth: GrowthState }) {
  const g = useRelCopy().growth;
  const { state, setState, paywall } = useRel();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RelationshipError | null>(null);
  const current = growth.summaries.find(s => s.week === growth.week) ?? null;

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const r = await relationshipSummaryAction();
      if (r.ok) setState(r.state);
      else if (r.error === "premium_required") paywall("growth");
      else setError(r.error);
    } catch {
      setError("ai_failed");
    }
    setBusy(false);
  }

  return (
    <section className="card rel-premium-card stack-sm" aria-labelledby="rel-summary-title">
      <div className="rel-premium-head"><PremiumBadge label={useRelCopy().premiumBadge} /><h2 id="rel-summary-title">{g.summaryTitle}</h2></div>
      {current ? (
        <>
          <SummaryBody s={current.summary} />
          <p className="muted rel-small">{g.summaryDone}</p>
        </>
      ) : (
        <>
          <p className="muted">{g.summaryBody}</p>
          {growth.hasActivity ? (
            <>
              <button type="button" className="btn btn--premium btn--block" disabled={busy || !state.aiConfigured || state.quota.remaining <= 0} aria-busy={busy} onClick={() => void ask()}>
                <Sparkles size={16} aria-hidden /> {busy ? g.summaryBusy : g.summaryAsk}
              </button>
              <QuotaNote />
            </>
          ) : (
            <p className="rel-callout">{g.summaryNothing}</p>
          )}
          <RelError error={error} />
        </>
      )}
    </section>
  );
}

function Past({ summaries }: { summaries: SummaryRecordDTO[] }) {
  const g = useRelCopy().growth;
  const { date } = useI18n();
  if (summaries.length === 0) return null;
  return (
    <section className="stack-sm" aria-labelledby="rel-past-title">
      <h2 id="rel-past-title">{g.pastTitle}</h2>
      {summaries.map(s => (
        <details key={s.id} className="card rel-past">
          <summary><CalendarHeart size={16} aria-hidden /> {g.weekOf(date(s.createdAt.slice(0, 10), "short"))}</summary>
          <div className="stack-sm"><SummaryBody s={s.summary} /></div>
        </details>
      ))}
    </section>
  );
}

function Sample() {
  const c = useRelCopy();
  const g = c.growth;
  return (
    <>
      <p className="rel-reflection-summary">{g.sampleSummary}</p>
      <div className="rel-reflection-list">
        <h3>{g.noticed}</h3>
        <ul>{g.sampleNoticed.map(x => <li key={x}>{x}</li>)}</ul>
      </div>
      <p className="rel-quote"><strong>{g.nextStep}:</strong> {g.sampleNext}</p>
    </>
  );
}

export default function Growth({ onBack, writeInJournal, onTrigger }: { onBack: () => void; writeInJournal: (s: string) => void; onTrigger: () => void }) {
  const c = useRelCopy();
  const g = c.growth;
  const { state } = useRel();
  const growth = state.growth;
  const question = growth ? g.questions[growth.question.tag][growth.question.index] ?? g.questions.general[0] : null;
  return (
    <div className="stack rel-feature">
      <button type="button" className="btn btn--text world-back" onClick={onBack}><ArrowLeft size={16} /> {c.back}</button>
      <header className="page-head">
        <div>
          <span className="eyebrow"><PremiumBadge label={c.premiumBadge} /></span>
          <h1>{g.name}</h1>
          <p>{g.pageLead}</p>
        </div>
      </header>
      {!state.premium || !growth ? (
        <section className="card rel-premium-card"><LockedPreview feature="growth"><Sample /></LockedPreview></section>
      ) : (
        <>
          {question && (
            <article className="card rel-daily">
              <span className="eyebrow"><MessageCircleQuestion size={13} /> {g.questionTitle}</span>
              <p className="rel-daily-q">{question}</p>
              <p className="muted rel-small">{g.questionBody}</p>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => writeInJournal(question)}>{g.write}</button>
            </article>
          )}
          <SummaryCard growth={growth} />
          {!growth.hasActivity && (
            <button type="button" className="btn btn--ghost btn--block" onClick={onTrigger}>{c.trigger.newEntry} <ArrowRight size={15} /></button>
          )}
          <Weeks weeks={growth.weeks} current={growth.week} />
          <Compare growth={growth} />
          <Past summaries={growth.summaries.filter(s => s.week !== growth.week)} />
        </>
      )}
      <p className="muted rel-small">{c.disclaimer}</p>
    </div>
  );
}
