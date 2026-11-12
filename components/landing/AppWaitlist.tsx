"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { Bell, Check, Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { joinAppWaitlistAction } from "@/lib/server/actions";
import { cleanEmail } from "@/lib/waitlist";
import BerripopMascot from "../berripop/BerripopMascot";

/**
 * A drawn phone for the landing hero: Berri's Today card, with a short
 * encouraging note from Berri dropping in as a notification (a new thought
 * each time it comes back). It shows the product and, at the same time, that
 * the phone app is coming.
 * Picture only (role="img"); sizes are in em, so font-size scales it.
 */
export function PhoneMock() {
  const { d } = useI18n();
  const w = d.landing.appWaitlist;
  const b = d.berriHome;
  const [n, setN] = useState(0);
  const thought = w.thoughts[n % w.thoughts.length];
  return (
    <div className="lp-phone" role="img" aria-label={w.phoneLabel}>
      <div className="lp-phone-screen" aria-hidden>
        <div className="lp-phone-status"><span>9:41</span><i className="lp-phone-island" /><span className="lp-phone-bars"><i /><i /><i /></span></div>
        <div className="lp-phone-note" onAnimationIteration={() => setN(x => x + 1)}>
          <span className="lp-phone-note-icon"><BerripopMascot size={18} motion="none" /></span>
          <div>
            <small>Berripop · {w.now}</small>
            <strong>{w.thoughtTitle}</strong>
            <p>{thought.text}{"by" in thought && thought.by ? <span className="lp-phone-note-by"> — {thought.by}</span> : null}</p>
          </div>
        </div>
        <div className="lp-phone-app">
          {/* eslint-disable-next-line @next/next/no-img-element -- transparent still from public/berri/pose, same as BerriStill */}
          <img className="lp-phone-berri" src="/berri/pose/peckish.png" alt="" width={720} height={796} />
          <p className="lp-phone-says">{w.phoneSays}</p>
          <div className="lp-phone-bowl"><span className="berri-bowl-dots"><i className="is-on" /><i /><i /></span> {b.bowl.replace("{n}", "1").replace("{total}", "3")}</div>
          <div className="lp-phone-meals">
            {(["question", "checkin", "moment"] as const).map((m, i) => <span key={m} className={i === 0 ? "is-done" : ""}>{b.meals[m]}</span>)}
          </div>
        </div>
        <div className="lp-phone-tabs"><i className="is-on" /><i /><i /><i /></div>
      </div>
    </div>
  );
}

/**
 * The slim "tell me when the app is ready" strip under the hero buttons: an
 * email field, an unticked consent box (never pre-ticked) and a link to the
 * privacy policy. The server checks the address and the consent again.
 */
export default function AppWaitlist() {
  const { d, locale } = useI18n();
  const w = d.landing.appWaitlist;
  const id = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<"email" | "consent" | "server" | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    if (!cleanEmail(email)) return setError("email");
    if (!consent) return setError("consent");
    setError(null);
    setState("sending");
    try {
      const r = await joinAppWaitlistAction({ email, consent, locale, website });
      if (r.ok) return setState("done");
      setError(r.error);
    } catch {
      setError("server");
    }
    setState("idle");
  };

  const message = error === "email" ? w.errEmail : error === "consent" ? w.errConsent : error === "server" ? w.errServer : null;

  return (
    <section id="app-waitlist" className="lp-waitlist" aria-labelledby={`${id}-title`}>
      {state === "done" ? (
        <div className="lp-waitlist-done" role="status">
          <BerripopMascot size={44} mood="excited" motion="subtle" />
          <div>
            <strong><Check size={16} strokeWidth={3} aria-hidden /> {w.doneTitle}</strong>
            <p>{w.done}</p>
          </div>
        </div>
      ) : (
        <>
          <p className="lp-waitlist-lead">
            <Smartphone size={18} aria-hidden />
            <span><strong id={`${id}-title`}>{w.title}</strong> {w.body}</span>
          </p>
          <form className="lp-waitlist-form" onSubmit={submit} noValidate>
            <label className="sr-only" htmlFor={`${id}-email`}>{w.emailLabel}</label>
            <div className="lp-waitlist-row">
              <input
                id={`${id}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={w.placeholder}
                value={email}
                maxLength={254}
                onChange={e => { setEmail(e.target.value); if (error === "email") setError(null); }}
                aria-invalid={error === "email"}
                aria-describedby={message ? `${id}-error` : undefined}
              />
              <button type="submit" className="btn btn--ghost" disabled={state === "sending"}>
                <Bell size={16} aria-hidden /> {state === "sending" ? w.sending : w.submit}
              </button>
            </div>
            {/* Hidden from people; bots that fill it in are ignored. */}
            <input className="lp-waitlist-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden value={website} onChange={e => setWebsite(e.target.value)} />
            <label className="lp-waitlist-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={e => { setConsent(e.target.checked); if (error === "consent") setError(null); }}
                aria-invalid={error === "consent"}
              />
              <span>{w.consent} <Link href="/privacy">{w.privacy}</Link></span>
            </label>
            {message && <p id={`${id}-error`} className="lp-waitlist-error" role="alert">{message}</p>}
          </form>
        </>
      )}
    </section>
  );
}
