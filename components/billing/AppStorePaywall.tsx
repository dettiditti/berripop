"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { APPLE_PRODUCTS, isAppleProduct } from "@/lib/billing/apple";
import { isPaidPlan } from "@/lib/billing/plans";
import type { AccountDTO } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import { appStore, hapticSuccess, type StoreProduct } from "@/lib/nativeBridge";
import { appleStoreSetupAction, recordApplePurchaseAction, trackAction, trackPlanSelectedAction } from "@/lib/server/actions";

/** Sends Apple's signed transactions to the server; true when at least one was stored or verified. */
export async function reportTransactions(jwsList: string[]): Promise<{ stored: number; testOnly: number; wrongAccount: boolean }> {
  let stored = 0, testOnly = 0, wrongAccount = false;
  for (const jws of jwsList) {
    try {
      const r = await recordApplePurchaseAction(jws);
      if (r.ok && r.stored) stored++;
      else if (r.ok) testOnly++;
      else if (r.error === "wrong_account") wrongAccount = true;
    } catch {
      // Tried again on the next app start.
    }
  }
  return { stored, testOnly, wrongAccount };
}

/**
 * The plans as sold in the App Store, inside the iPhone app. Prices, titles
 * and periods come from Apple (StoreKit). Buying runs through Apple; the
 * server verifies Apple's signed transaction before anything changes.
 */
export default function AppStorePaywall({ account, notify }: { account: AccountDTO; notify: (m: string) => void }) {
  const { d, t } = useI18n();
  const c = d.billing.appStore;
  const ent = account.entitlements;
  const [token, setToken] = useState<string | null>(null);
  const [products, setProducts] = useState<StoreProduct[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const store = appStore();
    if (!store) { setFailed(true); return; }
    let live = true;
    (async () => {
      try {
        const setup = await appleStoreSetupAction();
        if (!setup) throw new Error("signed_out");
        const { products } = await store.products({ ids: setup.products });
        if (!live) return;
        setToken(setup.token);
        // Premium first, monthly before annual.
        const order = Object.keys(APPLE_PRODUCTS);
        setProducts(products.filter(p => isAppleProduct(p.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)));
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => { live = false; };
  }, []);

  const done = (stored: boolean) => {
    hapticSuccess();
    notify(stored ? c.success : c.testOnly);
    if (stored) window.setTimeout(() => window.location.reload(), 900);
  };

  async function buy(p: StoreProduct) {
    const store = appStore();
    if (!store || !token || busy) return;
    setBusy(p.id);
    const meta = APPLE_PRODUCTS[p.id as keyof typeof APPLE_PRODUCTS];
    if (meta) void trackPlanSelectedAction(meta.plan, meta.interval, "app");
    void trackAction("apple_purchase_started", "app");
    try {
      const out = await store.purchase({ id: p.id, token });
      if (out.status === "purchased") {
        const r = await reportTransactions([out.jws]);
        if (r.wrongAccount) notify(c.wrongAccount);
        else if (r.stored || r.testOnly) done(r.stored > 0);
        else notify(c.failed);
      } else if (out.status === "pending") {
        notify(c.pending);
      }
    } catch {
      void trackAction("apple_purchase_failed", "app");
      notify(c.failed);
    }
    setBusy(null);
  }

  async function restore() {
    const store = appStore();
    if (!store || busy) return;
    setBusy("restore");
    try {
      const { transactions } = await store.restore();
      const r = await reportTransactions(transactions);
      if (r.wrongAccount && !r.stored) notify(c.wrongAccount);
      else if (r.stored || r.testOnly) done(r.stored > 0);
      else notify(c.nothingToRestore);
    } catch {
      notify(c.unavailable);
    }
    setBusy(null);
  }

  // Bought on the website: one subscription is enough, and it is managed there.
  if (ent.source === "stripe" && isPaidPlan(ent.plan)) return <p className="muted app-store-note">{c.webManaged}</p>;

  const currentId = ent.source === "apple" ? Object.entries(APPLE_PRODUCTS).find(([, v]) => v.plan === ent.plan && v.interval === ent.interval)?.[0] : null;

  return (
    <div className="app-store" aria-busy={!products && !failed}>
      <strong className="app-store-title">{c.title}</strong>
      {failed && <p className="field-hint" role="alert">{c.unavailable}</p>}
      {!products && !failed && <p className="muted">{c.loading}</p>}
      {products && (
        <ul className="app-store-list">
          {products.map(p => {
            const meta = APPLE_PRODUCTS[p.id as keyof typeof APPLE_PRODUCTS];
            const isCurrent = p.id === currentId;
            return (
              <li key={p.id} className={`app-store-item ${isCurrent ? "is-current" : ""}`}>
                <span className="app-store-copy">
                  <strong>{p.title}</strong>
                  <small>{meta.plan === "premium_plus" ? c.plusHint : c.premiumHint}</small>
                  <span className="app-store-price">{t(meta.interval === "year" ? c.perYear : c.perMonth, { price: p.price })}</span>
                </span>
                {isCurrent ? <span className="tag tag--sun">{c.current}</span> : (
                  <button type="button" className="btn btn--primary btn--sm" disabled={!!busy} aria-busy={busy === p.id} onClick={() => void buy(p)}>
                    {busy === p.id ? c.buying : c.buy}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="app-store-disclosure">{c.disclosure}</p>
      <div className="app-store-links">
        <Link href="/terms">{c.terms}</Link>
        <Link href="/privacy">{c.privacy}</Link>
      </div>
      <div className="row-gap">
        <button type="button" className="btn btn--ghost btn--sm" disabled={!!busy} onClick={() => void restore()}>{c.restore}</button>
        {ent.source === "apple" && <button type="button" className="btn btn--ghost btn--sm" onClick={() => appStore()?.manage().catch(() => notify(c.unavailable))}>{c.manage}</button>}
      </div>
    </div>
  );
}
