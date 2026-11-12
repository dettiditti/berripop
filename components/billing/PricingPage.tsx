"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Check, Info, Lock, Minus } from "lucide-react";
import { isPaidPlan, PLAN_LIMITS, PLAN_QUOTAS, priceFor, quotaTotal, quotaWindow, type BillingInterval, type PaidPlanId, type PlanId } from "@/lib/billing/plans";
import type { BuyerRegion, PublicSalesInfo } from "@/lib/billing/sales";
import type { AccountDTO } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { LEGAL_VERSIONS } from "@/lib/legal/records";
import { changePlanAction, getSnapshotAction, startCheckoutAction, startTrialAction, trackAction, trackPlanSelectedAction } from "@/lib/server/actions";
import BerripopMascot from "../berripop/BerripopMascot";
import TermsGate from "../TermsGate";

type Row = { label: string; hint?: string; value: string | boolean };

function PlanRows({ rows, highlight = false }: { rows: Row[]; highlight?: boolean }) {
  const { d } = useI18n();
  const c = d.billing.compare;
  return (
    <dl className={`plan-rows ${highlight ? "plan-rows--premium" : ""}`}>
      {rows.map(r => (
        <div key={r.label} className={`plan-row ${r.value === false ? "is-off" : ""}`}>
          <dt>{r.label}{r.hint && <small>{r.hint}</small>}</dt>
          <dd>
            {typeof r.value === "string" ? r.value
              : r.value ? <><Check size={16} strokeWidth={3} aria-hidden /><span className="sr-only">{c.included}</span></>
                : <><Minus size={16} aria-hidden /><span className="sr-only">{c.notIncluded}</span></>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The one-time 4-day trial on the Free card: what it gives (with its limits),
 * that no card is needed and nothing renews, and its state once started.
 */
function TrialBox({ account, signedIn, busy, note, onStart, thoughtEnabled }: {
  account: AccountDTO | null; signedIn: boolean; busy: boolean; note: string | null; onStart: () => void; thoughtEnabled: boolean;
}) {
  const { d, t, date } = useI18n();
  const tr = d.billing.trial;
  const ent = account?.entitlements;
  if (ent && isPaidPlan(ent.plan)) return null;
  const l = PLAN_LIMITS.trial;
  return (
    <div className="plan-trial">
      <strong>{tr.title}</strong>
      {ent?.trial.status === "active" && ent.trial.endsAt ? <p>{t(tr.active, { date: date(ent.trial.endsAt.slice(0, 10), "long") })}</p>
        : ent?.trial.status === "used" ? <p className="muted">{tr.alreadyUsed}</p>
          : (
            <>
              <p>{tr.body}</p>
              <p className="muted">{t(tr.limits, { journal: l.journalAiPerPeriod, ai: l.aiPerPeriod, goals: l.activeGoals })}{thoughtEnabled ? ` ${tr.limitsThought}` : ""}</p>
              {!signedIn ? <p className="muted">{tr.signedOut}</p> : (
                <button type="button" className="btn btn--primary btn--block" disabled={busy || !account} onClick={onStart}>{busy ? tr.starting : tr.cta}</button>
              )}
            </>
          )}
      {note && <p className="field-hint" role="status">{note}</p>}
    </div>
  );
}

/**
 * Free, Premium and Premium Plus side by side. Prices and limits come from
 * lib/billing/plans.ts, so the cards only show what the server enforces.
 * New subscriptions go through Stripe Checkout; a member who already pays
 * switches plans in the Stripe Customer Portal.
 */
export default function PricingPage({ from, testMode, sales, thoughtEnabled = false, relationshipEnabled = false }: {
  from?: string; testMode: boolean; sales: PublicSalesInfo;
  /** Kapcsolati világ rows only while the module is on. */
  relationshipEnabled?: boolean;
  /** Gondolatboncoló rows only while the feature is on, so a plan never lists what members can't use. */
  thoughtEnabled?: boolean;
}) {
  const { d, t, num, money, date } = useI18n();
  const b = d.billing;
  const { isLoaded, isSignedIn } = useAuth();
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [account, setAccount] = useState<AccountDTO | null>(null);
  const [busy, setBusy] = useState<PaidPlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What waits for Terms acceptance (a plan's checkout, or the trial); it resumes once recorded.
  const [termsFor, setTermsFor] = useState<PaidPlanId | "trial" | null>(null);
  const [trialBusy, setTrialBusy] = useState(false);
  const [trialNote, setTrialNote] = useState<string | null>(null);
  // Only asked when sales abroad are on; without it every sale is the Hungarian one.
  const [region, setRegion] = useState<BuyerRegion | null>(null);
  const chosenRegion: BuyerRegion | null = sales.abroad ? region : "home";

  useEffect(() => {
    void trackAction("pricing_viewed", from && ["goals", "ai", "summary", "circles", "profile", "journal", "start", "path"].includes(from) ? from : "pricing");
  }, [from]);

  useEffect(() => {
    if (!isSignedIn) return;
    getSnapshotAction().then(r => { if (r.ok) setAccount(r.snapshot.account); });
  }, [isSignedIn]);

  const current: PlanId | null = account?.entitlements.plan ?? null;
  const paying = isPaidPlan(current);
  const c = b.compare;
  const names: Record<PlanId, string> = { free: b.freeName, premium: b.premiumName, premium_plus: b.plusName };
  const priceOf = (plan: PaidPlanId) => priceFor(plan, interval) ?? priceFor(plan, "month")!;
  /** What a year costs less than twelve monthly payments. */
  const annualSaving = (plan: PaidPlanId) => priceFor(plan, "month")!.amount * 12 - priceOf(plan).amount;
  const priceText = (plan: PaidPlanId) => {
    const p = priceOf(plan);
    return t(p.interval === "year" ? b.perYear : b.perMonth, { price: money(p.amount, p.currency) });
  };

  /** Same rows in the same order on every card, so the plans compare line by line. */
  function rows(plan: PlanId): Row[] {
    const l = PLAN_LIMITS[plan];
    const thought = t(l.thoughtWindow === "once" ? c.thoughtOnce : c.thoughtMonthly, { n: num(l.thoughtSessions) });
    return [
      { label: c.goals, value: num(l.activeGoals) },
      { label: c.ai, hint: c.aiHint, value: num(l.aiPerPeriod) },
      { label: c.journal, value: num(l.journalAiPerPeriod) },
      { label: c.circleSummary, value: l.weeklySummary },
      { label: c.weeklyJournal, value: l.weeklyJournal },
      { label: c.insights, value: l.insightContext },
      { label: c.circles, hint: c.circlesHint, value: num(l.ownedCircles) },
      { label: c.assessment, value: num(l.assessmentAiPerPeriod) },
      ...(thoughtEnabled ? [
        { label: c.thought, hint: c.thoughtHint, value: thought },
        { label: c.thoughtViewpoints, value: num(l.thoughtViewpoints) },
        { label: c.thoughtDeep, hint: c.thoughtDeepHint, value: l.thoughtDeep },
      ] : []),
      ...(relationshipEnabled ? relationshipRows(plan) : []),
    ];
  }

  /** Kapcsolati világ: the tests are free for everyone; Premium adds the deeper layer (limits from PLAN_QUOTAS.relationship). */
  function relationshipRows(plan: PlanId): Row[] {
    const q = PLAN_QUOTAS[plan].relationship;
    const paid = isPaidPlan(plan);
    return [
      { label: c.relTests, hint: c.relTestsHint, value: true },
      { label: c.relDetail, hint: c.relDetailHint, value: paid },
      { label: c.relTrigger, hint: c.relTriggerHint, value: paid },
      { label: c.relAi, hint: c.relAiHint, value: quotaWindow(q) === "once" ? t(c.relAiOnce, { n: num(quotaTotal(q)) }) : t(c.relAiWeekly, { n: num(quotaTotal(q)) }) },
    ];
  }

  async function startTrial() {
    setTrialBusy(true);
    setTrialNote(null);
    try {
      const r = await startTrialAction();
      if (r.ok) {
        setTrialNote(t(b.trial.started, { date: date(r.endsAt.slice(0, 10), "long") }));
        const s = await getSnapshotAction();
        if (s.ok) setAccount(s.snapshot.account);
      } else if (r.error === "terms_required") {
        setTermsFor("trial");
      } else {
        setTrialNote(r.error === "already_used" ? b.trial.alreadyUsed : r.error === "already_premium" ? b.alreadyPremium : b.trial.failed);
      }
    } catch {
      setTrialNote(b.trial.failed);
    }
    setTrialBusy(false);
  }

  async function subscribe(plan: PaidPlanId) {
    if (!chosenRegion) return;
    void trackPlanSelectedAction(plan, priceOf(plan).interval, "pricing");
    setBusy(plan);
    setError(null);
    try {
      const r = await startCheckoutAction(priceOf(plan).interval, plan, chosenRegion);
      if (r.ok) {
        window.location.href = r.url;
        return;
      }
      if (r.error === "terms_required") {
        setTermsFor(plan);
        setBusy(null);
        return;
      }
      setError(r.error === "billing_unavailable" || r.error === "sales_unavailable" ? b.unavailable : r.error === "already_premium" ? b.alreadyPremium : b.checkoutError);
    } catch {
      setError(b.checkoutError);
    }
    setBusy(null);
  }

  async function switchTo(plan: PaidPlanId) {
    setBusy(plan);
    setError(null);
    try {
      const r = await changePlanAction(plan);
      if (r.ok) {
        window.location.href = r.url;
        return;
      }
      setError(r.error === "billing_unavailable" ? b.unavailable : b.planChangeError);
    } catch {
      setError(b.planChangeError);
    }
    setBusy(null);
  }

  function paidCard(plan: PaidPlanId) {
    const isCurrent = current === plan;
    const price = priceOf(plan);
    const id = `plan-${plan}`;
    return (
      <section key={plan} className={`card plan-card ${plan === "premium" ? "plan-card--premium" : "plan-card--plus"} ${isCurrent ? "is-current" : ""}`} aria-labelledby={id}>
        <div className="plan-card-head">
          <h2 id={id}>{names[plan]}</h2>
          {isCurrent ? <span className="tag tag--sun">{b.currentPlan}</span> : plan === "premium" && !paying ? <span className="tag tag--purple">{b.recommended}</span> : null}
        </div>
        <p className="muted">{plan === "premium" ? b.premiumTagline : b.plusTagline}</p>
        {plan === "premium_plus" && <p className="plan-note">{b.plusNow}</p>}
        <p className="plan-price">{priceText(plan)}</p>
        <p className="plan-note">
          {price.interval === "year"
            ? <>{t(b.annualEquivalent, { price: money(Math.round(price.amount / 12), price.currency) })} <strong className="plan-save">{t(b.annualSave, { amount: money(annualSaving(plan), price.currency) })}</strong></>
            : b.billedMonthly}
        </p>
        <PlanRows rows={rows(plan)} highlight />
        {!paying && (
          <div className="plan-checkout">
            <strong><Info size={15} /> {b.checkoutTitle}</strong>
            <p>{t(price.interval === "year" ? b.checkoutYear : b.checkoutMonth, { price: money(price.amount, price.currency) })}</p>
            <p>{b.cancelAnytime}</p>
            {chosenRegion === "abroad" ? <p>{b.managedNote}</p> : (
              <>
                {sales.taxNote === "aam" && <p>{b.taxNoteAam}</p>}
                {!sales.abroad && sales.countries.length === 1 && sales.countries[0] === "HU" && <p>{b.countryHuOnly}</p>}
                <p>{b.invoiceNote}</p>
              </>
            )}
          </div>
        )}
        {paying && !isCurrent && <p className="plan-note">{b.switchNote}</p>}
        {!isLoaded ? null : !isSignedIn ? (
          <Link className="btn btn--primary btn--lg btn--block plan-cta" href="/sign-in?redirect_url=%2Fpricing">{b.signInToSubscribe}</Link>
        ) : isCurrent ? (
          <Link className="btn btn--ghost btn--block plan-cta" href="/settings#subscription">{b.settings.manage}</Link>
        ) : paying ? (
          <button className="btn btn--primary btn--block plan-cta" disabled={busy !== null} onClick={() => switchTo(plan)}>
            {busy === plan ? b.redirecting : t(b.switchTo, { plan: names[plan] })}
          </button>
        ) : (
          <button className={`btn ${plan === "premium" ? "btn--primary" : "btn--ghost"} btn--lg btn--block plan-cta`} disabled={busy !== null || !account || !sales.available || !chosenRegion} onClick={() => subscribe(plan)}>
            {busy === plan ? b.redirecting : `${plan === "premium" ? b.subscribe : b.subscribePlus} · ${priceText(plan)}`}
          </button>
        )}
      </section>
    );
  }

  return (
    <main className="pricing">
      <header className="pricing-head">
        <BerripopMascot mood="excited" size={84} />
        <span className="eyebrow">{b.pricingEyebrow}</span>
        <h1>{b.pricingTitle}</h1>
        <p>{b.pricingIntro}</p>
      </header>

      <div className="segmented pricing-toggle" role="radiogroup" aria-label={b.intervalLabel}>
        {(["month", "year"] as const).map(iv => (
          <button key={iv} type="button" role="radio" aria-checked={interval === iv} className={`segmented-option ${interval === iv ? "is-active" : ""}`} onClick={() => setInterval(iv)}>
            {iv === "month" ? b.monthly : b.annual}
          </button>
        ))}
      </div>

      {sales.abroad && !paying && (
        <div className="pricing-region">
          <span id="region-label">{b.regionLabel}</span>
          <div className="segmented pricing-toggle" role="radiogroup" aria-labelledby="region-label">
            {(["home", "abroad"] as const).map(r => (
              <button key={r} type="button" role="radio" aria-checked={region === r} className={`segmented-option ${region === r ? "is-active" : ""}`} onClick={() => setRegion(r)}>
                {r === "home" ? b.regionHome : b.regionAbroad}
              </button>
            ))}
          </div>
          {!region && isSignedIn && <p className="field-hint">{b.regionPick}</p>}
        </div>
      )}

      <div className="plan-grid plan-grid--3">
        <section className={`card plan-card ${current === "free" ? "is-current" : ""}`} aria-labelledby="plan-free">
          <div className="plan-card-head">
            <h2 id="plan-free">{b.freeName}</h2>
            {current === "free" && <span className="tag">{b.currentPlan}</span>}
          </div>
          <p className="muted">{b.freeTagline}</p>
          <p className="plan-price">{b.freePrice}</p>
          <p className="plan-note">{b.freePriceNote}</p>
          <PlanRows rows={rows("free")} />
          <TrialBox account={account} signedIn={!!isSignedIn} busy={trialBusy} note={trialNote} onStart={startTrial} thoughtEnabled={thoughtEnabled} />
          <Link className="btn btn--ghost btn--block plan-cta" href="/">{b.continueFree}</Link>
        </section>
        {paidCard("premium")}
        {paidCard("premium_plus")}
      </div>

      <section className="card plan-both" aria-labelledby="plan-both-title">
        <h2 id="plan-both-title">{c.bothTitle}</h2>
        <ul>{c.both.map(x => <li key={x}><Check size={16} strokeWidth={3} /> {x}</li>)}</ul>
      </section>

      {!sales.available && <p className="field-hint">{b.salesPaused}</p>}
      {error && <p className="field-hint" role="alert">{error}</p>}
      {termsFor && <TermsGate version={LEGAL_VERSIONS.terms} context="checkout" onAccepted={() => { const next = termsFor; setTermsFor(null); void (next === "trial" ? startTrial() : subscribe(next)); }} onCancel={() => setTermsFor(null)} />}
      {testMode && <p className="prototype-note"><Info size={14} /> {b.testMode}</p>}

      <section className="pricing-terms">
        <p>{b.terms}</p>
        <p>{b.fairUse}</p>
        <p><Lock size={13} /> {b.privacyNote}</p>
        <p>{b.noDiagnosis}</p>
        <p className="auth-legal pricing-legal">
          <Link href="/terms">{d.account.legal.terms}</Link>
          <Link href="/privacy">{d.account.legal.privacy}</Link>
          <Link href="/contact">{d.account.legal.contact}</Link>
        </p>
      </section>
      <Link className="btn btn--text" href="/">{b.back}</Link>
    </main>
  );
}
