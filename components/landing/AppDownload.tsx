"use client";

import { useId, useState } from "react";
import { ArrowUpRight, Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { appStoreLink, type AppStorePlacement } from "@/lib/native";
import { trackAction } from "@/lib/server/actions";
import BerripopMascot from "../berripop/BerripopMascot";

/**
 * A drawn phone for the landing hero: Berri's Today card, with a short
 * encouraging note from Berri dropping in as a notification (a new thought
 * each time it comes back). It shows the product and that it lives on the
 * phone too.
 * Picture only (role="img"); sizes are in em, so font-size scales it.
 */
export function PhoneMock({ winter = false }: { winter?: boolean }) {
  const { d } = useI18n();
  const w = d.landing.appDownload;
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
          <img className="lp-phone-berri" src={winter ? "/berri/berri-xmas.png" : "/berri/pose/peckish.png"} alt="" width={winter ? 611 : 720} height={winter ? 720 : 796} />
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
 * Counts a tap on an App Store link: only the event and which link, no id, no
 * cookie (the visitor is not signed in). Once per link per tab, so repeated
 * taps do not inflate it.
 */
export function trackAppStoreClick(placement: AppStorePlacement) {
  const key = `berripop.appStore.${placement}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // Without storage it is simply counted.
  }
  void trackAction("app_store_clicked", placement).catch(() => {});
}

/**
 * The slim "get the iPhone app" strip under the hero buttons: a link to the
 * App Store and a line for Android, where the app is not out yet.
 */
export default function AppDownload() {
  const { d } = useI18n();
  const w = d.landing.appDownload;
  const id = useId();
  return (
    <section id="app-download" className="lp-waitlist lp-download" aria-labelledby={`${id}-title`}>
      <p className="lp-waitlist-lead">
        <Smartphone size={18} aria-hidden />
        <span><strong id={`${id}-title`}>{w.title}</strong> {w.body}</span>
      </p>
      <a className="btn lp-store-btn" href={appStoreLink("landing_strip")} target="_blank" rel="noopener" onClick={() => trackAppStoreClick("landing_strip")}>
        <span className="lp-store-btn-text"><small>{w.storeSmall}</small><strong>App Store</strong></span>
        <ArrowUpRight size={18} aria-hidden />
      </a>
      <p className="lp-download-note">{w.android}</p>
    </section>
  );
}
