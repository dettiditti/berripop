"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Check, Info, Lock, Minus } from "lucide-react";
import { isPaidPlan, PLAN_LIMITS, PRICES, type BillingInterval, type PaidPlanId, type PlanId } from "@/lib/billing/plans";
import type { AccountDTO } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { changePlanAction, getSnapshotAction, startCheckoutAction, trackAction } from "@/lib/server/actions";
import BerripopMascot from "../berripop/BerripopMascot";

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
 * Free, Premium and Premium Plus side by side. Prices and limits come from
 * lib/billing/plans.ts, so the cards only show what the server enforces.
 * New subscriptions go through Stripe Checkout; a member who already pays
 * switches plans in the Stripe Customer Portal.
 */
export default function PricingPage({ from, testMode }: { from?: string; testMode: boolean }) {
  const { d, t, num, money } = useI18n();
  const b = d.billing;
  const { isLoaded, isSignedIn } = useAuth();
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [account, setAccount] = useState<AccountDTO | null>(null);
  const [busy, setBusy] = useState<PaidPlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const annualSaving = PRICES.monthly.amount * 12 - PRICES.annual.amount;
  const names: Record<PlanId, string> = { free: b.freeName, premium: b.premiumName, premium_plus: b.plusName };
  // Premium Plus is sold monthly only, whatever the toggle says.
  const priceOf = (plan: PaidPlanId) => (plan === "premium_plus" ? PRICES.plus_monthly : interval === "year" ? PRICES.annual : PRICES.monthly);
  const priceText = (plan: PaidPlanId) => {
    const p = priceOf(plan);
    return t(p.interval === "year" ? b.perYear : b.perMonth, { price: money(p.amount, p.currency) });
  };

  /** Same rows in the same order on every card, so the plans compare line by line. */
  function rows(plan: PlanId): Row[] {
    const l = PLAN_LIMITS[plan];
    return [
      { label: c.goals, value: num(l.activeGoals) },
      { label: c.ai, hint: c.aiHint, value: num(l.aiPerPeriod) },
      { label: c.journal, value: num(l.journalAiPerPeriod) },
      { label: c.circleSummary, value: l.weeklySummary },
      { label: c.weeklyJournal, value: l.weeklyJournal },
      { label: c.insights, value: l.insightContext },
      { label: c.circles, hint: c.circlesHint, value: num(l.ownedCircles) },
    ];
  }

  async function subscribe(plan: PaidPlanId) {
    setBusy(plan);
    setError(null);
    try {
      const r = await startCheckoutAction(priceOf(plan).interval, plan);
      if (r.ok) {
        window.location.href = r.url;
        return;
      }
      setError(r.error === "billing_unavailable" ? b.unavailable : r.error === "already_premium" ? b.alreadyPremium : b.checkoutError);
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
        <p className="plan-price">{priceText(plan)}</p>
        <p className="plan-note">
          {plan === "premium_plus"
            ? <>{interval === "year" && <>{b.plusMonthlyOnly} </>}{b.billedMonthly}</>
            : interval === "year"
              ? <>{t(b.annualEquivalent, { price: money(Math.round(price.amount / 12), price.currency) })} <strong className="plan-save">{t(b.annualSave, { amount: money(annualSaving, price.currency) })}</strong></>
              : b.billedMonthly}
        </p>
        <PlanRows rows={rows(plan)} highlight />
        {!paying && (
          <div className="plan-checkout">
            <strong><Info size={15} /> {b.checkoutTitle}</strong>
            <p>{t(price.interval === "year" ? b.checkoutYear : b.checkoutMonth, { price: money(price.amount, price.currency) })}</p>
            <p>{b.cancelAnytime}</p>
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
          <button className={`btn ${plan === "premium" ? "btn--primary" : "btn--ghost"} btn--lg btn--block plan-cta`} disabled={busy !== null || !account} onClick={() => subscribe(plan)}>
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
          <Link className="btn btn--ghost btn--block plan-cta" href="/">{b.continueFree}</Link>
        </section>
        {paidCard("premium")}
        {paidCard("premium_plus")}
      </div>

      <section className="card plan-both" aria-labelledby="plan-both-title">
        <h2 id="plan-both-title">{c.bothTitle}</h2>
        <ul>{c.both.map(x => <li key={x}><Check size={16} strokeWidth={3} /> {x}</li>)}</ul>
      </section>

      {error && <p className="field-hint" role="alert">{error}</p>}
      {testMode && <p className="prototype-note"><Info size={14} /> {b.testMode}</p>}

      <section className="pricing-terms">
        <p>{b.terms}</p>
        <p>{b.fairUse}</p>
        <p><Lock size={13} /> {b.privacyNote}</p>
        <p>{b.noDiagnosis}</p>
        <p className="auth-legal pricing-legal">
          <Link href="/terms">{d.account.legal.terms}</Link>
          <Link href="/privacy">{d.account.legal.privacy}</Link>
        </p>
      </section>
      <Link className="btn btn--text" href="/">{b.back}</Link>
    </main>
  );
}
