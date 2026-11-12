"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { PRICES } from "@/lib/billing/plans";
import { OFFER_CLAIM_KEY, OFFER_TRACKED_KEY, offerAllowed } from "@/lib/billing/prompt-policy";
import type { AccountDTO } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { appStore } from "@/lib/nativeBridge";
import { startCheckoutAction, startTrialAction, trackAction } from "@/lib/server/actions";
import { useNativeApp } from "../useNativeApp";
import { Sheet } from "../Modals";
import AppStorePaywall from "./AppStorePaywall";

export type UpgradeKind = "goals" | "ai" | "summary" | "circles" | "journal" | "start" | "path" | "relationship";

const key = (kind: UpgradeKind) => `kozos-upgrade-dismissed:${kind}`;

/**
 * From the app shell: how many different days the member has been active
 * (without it offers behave as before), and the account and toast used by the
 * App Store plans inside the iPhone app.
 */
export const OfferContext = createContext<{ activeDays: number; account?: AccountDTO; notify?: (m: string) => void }>({ activeDays: Number.POSITIVE_INFINITY });

function session(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}
function setSession(key: string, value: string) {
  try { window.sessionStorage.setItem(key, value); } catch { /* not kept: rules still apply within this page */ }
}

/**
 * Counts "shown" once per kind and visit, so moving between tabs does not
 * inflate the numbers. A prompt at a limit or a locked feature is also a
 * feature paywall (feature_paywall_viewed, with the feature as context).
 */
function countShown(kind: UpgradeKind, atLimit: boolean) {
  const counted = (session(OFFER_TRACKED_KEY) ?? "").split(",").filter(Boolean);
  if (counted.includes(kind)) return;
  setSession(OFFER_TRACKED_KEY, [...counted, kind].join(","));
  void trackAction("upgrade_prompt_shown", kind);
  if (atLimit) void trackAction("feature_paywall_viewed", kind);
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
 * Inside the iPhone app nothing points to the website's checkout or prices
 * (App Store rules): the same offer opens the App Store plans instead, with
 * Apple's own prices. Without the store (an older app version) a limit is
 * still explained in a neutral note.
 */
export default function UpgradePrompt({ kind, vars = {}, force = false, atLimit = false, onAction }: {
  kind: UpgradeKind; vars?: Record<string, string | number>; force?: boolean; atLimit?: boolean;
  /** Called when the member starts the trial, a checkout or the App Store plans from this offer (for attribution). */
  onAction?: () => void;
}) {
  const { d, t, money, date } = useI18n();
  const p = d.billing.prompts;
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = money(PRICES.monthly.amount, PRICES.monthly.currency);
  const inApp = useNativeApp();
  const { activeDays, account, notify } = useContext(OfferContext);
  const limit = atLimit || force;
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeReady, setStoreReady] = useState(false);
  useEffect(() => { setStoreReady(!!appStore()); }, []);
  const sellsInApp = inApp && storeReady && !!account;
  // A Free member who never had the trial is offered that first: free, no card, nothing renews.
  const trialOpen = account?.entitlements.plan === "free" && account.entitlements.trial.status === "available";
  const [trialBusy, setTrialBusy] = useState(false);

  async function startTrial() {
    onAction?.();
    setTrialBusy(true);
    setError(null);
    try {
      const r = await startTrialAction();
      if (r.ok) {
        notify?.(t(d.billing.trial.started, { date: date(r.endsAt.slice(0, 10), "long") }));
        window.setTimeout(() => window.location.reload(), 900);
        return;
      }
      setError(r.error === "terms_required" ? d.billing.termsRequired : r.error === "already_used" ? d.billing.trial.alreadyUsed : r.error === "already_premium" ? d.billing.alreadyPremium : d.billing.trial.failed);
    } catch {
      setError(d.billing.trial.failed);
    }
    setTrialBusy(false);
  }

  useEffect(() => {
    if (inApp && !sellsInApp) return;
    const dismissed = !force && wasDismissed(kind);
    const allowed = !dismissed && offerAllowed({ kind, atLimit: limit, activeDays, claimedThisVisit: session(OFFER_CLAIM_KEY) });
    setHidden(!allowed);
    if (!allowed) return;
    if (!limit) setSession(OFFER_CLAIM_KEY, kind);
    countShown(kind, limit);
  }, [kind, force, limit, activeDays, inApp, sellsInApp]);

  if (inApp && !sellsInApp && !trialOpen) {
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
    onAction?.();
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
        {trialOpen ? (
          <>
            <p className="upgrade-price">{d.billing.trial.body}</p>
            <div className="upgrade-actions">
              <button type="button" className="btn btn--primary btn--sm" disabled={trialBusy} onClick={() => void startTrial()}>{trialBusy ? d.billing.trial.starting : d.billing.trial.cta}</button>
              {!inApp && <Link className="btn btn--text btn--inline" href={`/pricing?from=${kind}`}>{p.compare}</Link>}
            </div>
          </>
        ) : sellsInApp ? (
          <div className="upgrade-actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => { onAction?.(); setStoreOpen(true); }}>{d.billing.appStore.openStore}</button>
          </div>
        ) : (
          <>
            <p className="upgrade-price">{t(p.offerPrice, { price })}</p>
            <div className="upgrade-actions">
              <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={checkout}>{busy ? d.billing.redirecting : t(p.offerCta, { price })}</button>
              <Link className="btn btn--text btn--inline" href={`/pricing?from=${kind}`}>{p.compare}</Link>
            </div>
          </>
        )}
        {error && <p className="field-hint" role="alert">{error}</p>}
      </div>
      {!force && <button className="icon-btn" onClick={dismiss} aria-label={p.dismiss}><X size={18} /></button>}
      {storeOpen && account && (
        <Sheet title={d.billing.appStore.title} kicker={d.billing.premiumName} onClose={() => setStoreOpen(false)}>
          <AppStorePaywall account={account} notify={m => notify?.(m)} />
        </Sheet>
      )}
    </aside>
  );
}
