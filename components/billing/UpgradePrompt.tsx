"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { PRICES } from "@/lib/billing/plans";
import { OFFER_CLAIM_KEY, OFFER_TRACKED_KEY, offerAllowed } from "@/lib/billing/prompt-policy";
import { useI18n } from "@/lib/i18n/client";
import { startCheckoutAction, trackAction } from "@/lib/server/actions";
import { useNativeApp } from "../useNativeApp";

export type UpgradeKind = "goals" | "ai" | "summary" | "circles" | "journal" | "start" | "path";

const key = (kind: UpgradeKind) => `kozos-upgrade-dismissed:${kind}`;

/** How many different days the member has been active; the app shell provides it. Without it offers behave as before. */
export const OfferContext = createContext<{ activeDays: number }>({ activeDays: Number.POSITIVE_INFINITY });

function session(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}
function setSession(key: string, value: string) {
  try { window.sessionStorage.setItem(key, value); } catch { /* not kept: rules still apply within this page */ }
}

/** Counts "shown" once per kind and visit, so moving between tabs does not inflate the numbers. */
function countShown(kind: UpgradeKind) {
  const counted = (session(OFFER_TRACKED_KEY) ?? "").split(",").filter(Boolean);
  if (counted.includes(kind)) return;
  setSession(OFFER_TRACKED_KEY, [...counted, kind].join(","));
  void trackAction("upgrade_prompt_shown", kind);
}

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
 *
 * Offers that are not at a limit wait for a few active days and show at most
 * one per visit (lib/billing/prompt-policy.ts); `atLimit` (or `force`) marks
 * the ones that explain a limit the member just reached.
 *
 * Inside the phone app nothing is sold (App Store rules): no price, button or
 * link, and no "shown" event. At a limit the member still learns why
 * something stopped, in a neutral note.
 */
export default function UpgradePrompt({ kind, vars = {}, force = false, atLimit = false }: { kind: UpgradeKind; vars?: Record<string, string | number>; force?: boolean; atLimit?: boolean }) {
  const { d, t, money } = useI18n();
  const p = d.billing.prompts;
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = money(PRICES.monthly.amount, PRICES.monthly.currency);
  const inApp = useNativeApp();
  const { activeDays } = useContext(OfferContext);
  const limit = atLimit || force;

  useEffect(() => {
    if (inApp) return;
    const dismissed = !force && wasDismissed(kind);
    const allowed = !dismissed && offerAllowed({ kind, atLimit: limit, activeDays, claimedThisVisit: session(OFFER_CLAIM_KEY) });
    setHidden(!allowed);
    if (!allowed) return;
    if (!limit) setSession(OFFER_CLAIM_KEY, kind);
    countShown(kind);
  }, [kind, force, limit, activeDays, inApp]);

  if (inApp) {
    const note = kind === "goals" || kind === "ai" ? d.billing.appLimits[kind] : null;
    return note ? <p className="app-limit-note" role="status">{t(note, vars)}</p> : null;
  }
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
