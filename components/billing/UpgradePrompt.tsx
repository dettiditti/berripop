"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { PRICES } from "@/lib/billing/plans";
import { useI18n } from "@/lib/i18n/client";
import { startCheckoutAction, trackAction } from "@/lib/server/actions";

export type UpgradeKind = "goals" | "ai" | "summary" | "circles" | "journal" | "start" | "path";

const key = (kind: UpgradeKind) => `kozos-upgrade-dismissed:${kind}`;

function wasDismissed(kind: UpgradeKind) {
  try {
    return window.localStorage.getItem(key(kind)) === "1";
  } catch {
    return false;
  }
}

/**
 * A calm, inline Premium offer shown only at a relevant moment: it names the
 * concrete benefit, shows the real monthly price and renewal, and can start
 * the existing Stripe checkout. Once dismissed it stays hidden on this device
 * (unless `force`, e.g. right at a limit); it never blocks content.
 */
export default function UpgradePrompt({ kind, vars = {}, force = false }: { kind: UpgradeKind; vars?: Record<string, string | number>; force?: boolean }) {
  const { d, t, money } = useI18n();
  const p = d.billing.prompts;
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = money(PRICES.monthly.amount, PRICES.monthly.currency);

  useEffect(() => {
    const dismissed = !force && wasDismissed(kind);
    setHidden(dismissed);
    if (!dismissed) void trackAction("upgrade_prompt_shown", kind);
  }, [kind, force]);

  if (hidden) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(key(kind), "1");
    } catch {
      // Not persisted; still hide for now.
    }
    setHidden(true);
    void trackAction("upgrade_prompt_dismissed", kind);
  }

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      const r = await startCheckoutAction("month");
      if (r.ok) {
        window.location.href = r.url;
        return;
      }
      setError(r.error === "terms_required" ? d.billing.termsRequired : r.error === "already_premium" ? d.billing.alreadyPremium : r.error === "billing_unavailable" || r.error === "sales_unavailable" ? d.billing.unavailable : d.billing.checkoutError);
    } catch {
      setError(d.billing.checkoutError);
    }
    setBusy(false);
  }

  return (
    <aside className="upgrade-prompt" aria-label={p[kind].title}>
      <span className="upgrade-icon" aria-hidden><Sparkles size={18} /></span>
      <div className="upgrade-copy">
        <strong>{p[kind].title}</strong>
        <p>{t(p[kind].body, vars)}</p>
        <p className="upgrade-price">{t(p.offerPrice, { price })}</p>
        <div className="upgrade-actions">
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={checkout}>{busy ? d.billing.redirecting : t(p.offerCta, { price })}</button>
          <Link className="btn btn--text btn--inline" href={`/pricing?from=${kind}`}>{p.compare}</Link>
        </div>
        {error && <p className="field-hint" role="alert">{error}</p>}
      </div>
      {!force && <button className="icon-btn" onClick={dismiss} aria-label={p.dismiss}><X size={18} /></button>}
    </aside>
  );
}
