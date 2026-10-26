"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { confirmCheckoutAction, trackAction } from "@/lib/server/actions";
import AuthShell from "../AuthShell";
import BerripopMascot from "../berripop/BerripopMascot";

type State = "checking" | "active" | "pending" | "invalid";

/**
 * Checkout return pages. "success" asks the server to verify the session with
 * Stripe: the URL alone never grants Premium.
 */
export default function CheckoutReturn({ kind, sessionId }: { kind: "success" | "canceled"; sessionId?: string }) {
  const { d } = useI18n();
  const b = d.billing;
  const [state, setState] = useState<State>(kind === "success" ? "checking" : "invalid");

  const check = useCallback(async () => {
    if (!sessionId) return setState("invalid");
    setState("checking");
    const r = await confirmCheckoutAction(sessionId);
    setState(r.state);
  }, [sessionId]);

  useEffect(() => {
    if (kind === "success") void check();
    else void trackAction("checkout_canceled");
  }, [kind, check]);

  if (kind === "canceled") {
    return (
      <AuthShell>
        <section className="card join-card">
          <BerripopMascot mood="comforting" size={84} />
          <h1>{b.canceled.title}</h1>
          <p className="muted">{b.canceled.body}</p>
          <Link className="btn btn--primary btn--block" href="/">{b.back}</Link>
          <Link className="btn btn--text" href="/pricing">{b.pricingEyebrow}</Link>
        </section>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <section className="card join-card" aria-live="polite">
        <BerripopMascot mood={state === "active" ? "excited" : state === "checking" ? "thinking" : "comforting"} size={84} motion={state === "active" ? "lively" : "subtle"} />
        {state === "checking" && <p className="muted">{b.success.checking}</p>}
        {state === "active" && (
          <>
            <h1>{b.success.title}</h1>
            <p className="muted">{b.success.body}</p>
            <Link className="btn btn--primary btn--block" href="/">{b.success.open}</Link>
          </>
        )}
        {state === "pending" && (
          <>
            <p className="muted">{b.success.pending}</p>
            <button className="btn btn--primary btn--block" onClick={check}>{b.success.retry}</button>
            <Link className="btn btn--text" href="/">{b.back}</Link>
          </>
        )}
        {state === "invalid" && (
          <>
            <p className="muted">{b.success.invalid}</p>
            <Link className="btn btn--primary btn--block" href="/">{b.back}</Link>
          </>
        )}
      </section>
    </AuthShell>
  );
}
