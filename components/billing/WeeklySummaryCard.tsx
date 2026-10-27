"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { AccountDTO } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { weeklySummaryAction } from "@/lib/server/actions";
import UpgradePrompt from "./UpgradePrompt";

/** Premium weekly summary of the member's own answers. Free members see a dismissible suggestion. */
export default function WeeklySummaryCard({ account, circleId, notify }: { account: AccountDTO; circleId: string | null; notify: (m: string) => void }) {
  const { d, t, date } = useI18n();
  const a = d.aiAssist;
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const premium = account.entitlements.limits.weeklySummary;

  async function create() {
    setBusy(true);
    const r = await weeklySummaryAction(circleId);
    setBusy(false);
    if (r.ok) return setSummary(r.summary);
    if (r.error === "invalid") notify(a.summaryEmpty);
    else if (r.error === "limit_ai") notify(t(d.billing.prompts.ai.title));
    else if (r.error === "premium_required") notify(d.billing.prompts.summary.title);
    else if (r.error === "ai_consent_required") notify(d.aiAssist.consentRequired);
    else notify(a.unavailable);
  }

  if (!premium) return <UpgradePrompt kind="summary" />;

  return (
    <section className="card summary-card" aria-labelledby="summary-title">
      <div className="section-head">
        <h2 id="summary-title"><Sparkles size={18} /> {a.summaryTitle}</h2>
        <span className="tag tag--sun">{a.premiumTag}</span>
      </div>
      <p className="muted">{a.summaryBody}</p>
      {summary ? <p className="summary-text">{summary}</p> : (
        <button className="btn btn--primary btn--sm" disabled={busy || !account.aiConfigured || account.ai.reached} onClick={create}>{busy ? a.summaryWorking : a.summaryCta}</button>
      )}
      {account.ai.reached && <small className="muted">{t(d.billing.prompts.ai.body, { date: date(account.ai.resets), n: account.ai.limit })}</small>}
      <small className="muted">{a.summaryDisclosure}</small>
    </section>
  );
}
