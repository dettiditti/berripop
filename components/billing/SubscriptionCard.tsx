"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CreditCard, Sparkles } from "lucide-react";
import { isPaidPlan } from "@/lib/billing/plans";
import type { AccountDTO } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { openBillingPortalAction } from "@/lib/server/actions";

/** Current plan, status and billing management. Shows only what Stripe has confirmed. */
export default function SubscriptionCard({ account, notify }: { account: AccountDTO; notify: (m: string) => void }) {
  const { d, t, date } = useI18n();
  const s = d.billing.settings;
  const ent = account.entitlements;
  const [busy, setBusy] = useState(false);
  const periodEnd = ent.currentPeriodEnd ? date(ent.currentPeriodEnd.slice(0, 10), "long") : null;
  const statusLabel = s.statuses[ent.status as keyof typeof s.statuses] ?? ent.status;
  const paid = isPaidPlan(ent.plan);
  const planName = ent.plan === "premium_plus" ? d.billing.plusName : ent.plan === "premium" ? d.billing.premiumName : d.billing.freeName;

  async function portal() {
    setBusy(true);
    const r = await openBillingPortalAction();
    if (r.ok) {
      window.location.href = r.url;
      return;
    }
    setBusy(false);
    notify(r.error === "billing_unavailable" ? d.billing.unavailable : s.portalError);
  }

  return (
    <section className="card subscription-card" aria-labelledby="sub-title">
      <div className="section-head">
        <h2 id="sub-title"><CreditCard size={18} /> {s.title}</h2>
        <span className={`tag ${paid ? "tag--sun" : ""}`}>{planName}</span>
      </div>
      <dl className="sub-facts">
        <div><dt>{s.status}</dt><dd>{statusLabel}</dd></div>
        {ent.interval && <div><dt>{s.interval}</dt><dd>{s.intervals[ent.interval]}</dd></div>}
      </dl>
      {ent.paymentIssue && <p className="sub-warning" role="status"><AlertTriangle size={15} /> {s.paymentIssue}</p>}
      {paid && periodEnd && <p className="muted">{ent.cancelAtPeriodEnd ? t(s.endsOn, { date: periodEnd }) : t(s.renews, { date: periodEnd })}</p>}
      {ent.ended && <p className="muted">{s.ended}</p>}

      <div className="ai-meter">
        <span className="shared-progress-label">{s.aiTitle}</span>
        <div className="bar bar--thin"><span style={{ width: `${account.ai.limit ? (account.ai.used / account.ai.limit) * 100 : 0}%` }} /></div>
        <small className="muted">{t(s.aiUsage, { used: account.ai.used, limit: account.ai.limit })} · {t(s.aiResets, { date: date(account.ai.resets) })}</small>
      </div>

      <div className="row-gap">
        {ent.plan === "free" && <Link className="btn btn--primary btn--sm" href="/pricing?from=profile"><Sparkles size={16} /> {s.upgrade}</Link>}
        {paid && <Link className="btn btn--ghost btn--sm" href="/pricing?from=profile">{s.changePlan}</Link>}
        {account.hasBillingCustomer && <button className="btn btn--ghost btn--sm" disabled={busy} onClick={portal}>{s.manage}</button>}
      </div>
    </section>
  );
}
