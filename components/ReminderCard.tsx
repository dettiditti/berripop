"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { pushPermission, pushToken } from "@/lib/nativeBridge";
import { pushPrefsAction, setPushPrefsAction, setPushReminderAction } from "@/lib/server/actions";
import type { PushPrefs } from "@/lib/push/schedule";
import NotifyKinds from "./NotifyKinds";
import { useNativeApp } from "./useNativeApp";

/**
 * Settings, iPhone app only: notifications for this phone. Turning them on
 * asks iOS for permission (only now, never on first launch) and stores the
 * phone's token and time zone; turning them off deletes it. While on, the two
 * kinds (Berri's morning thought, the afternoon "Don't forget yourself" reminder) each have a switch and an hour; the thought can also be fitted to the member (chosen areas and check-in mood, never the journal).
 */
export default function ReminderCard({ notify }: { notify: (message: string) => void }) {
  const inApp = useNativeApp();
  const { d } = useI18n();
  const s = d.settings;
  const [state, setState] = useState<"loading" | "on" | "off" | "denied" | "unavailable">("loading");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<PushPrefs | null>(null);

  useEffect(() => {
    if (!inApp) return;
    let live = true;
    (async () => {
      const permission = await pushPermission();
      if (!live) return;
      if (permission === "unavailable") return setState("unavailable");
      if (permission === "denied") return setState("denied");
      if (permission === "prompt") return setState("off");
      // Already allowed: the token is handed out again without asking.
      const tk = await pushToken();
      if (!live) return;
      if (typeof tk !== "string" || tk === "denied") return setState("off");
      setToken(tk);
      const p = await pushPrefsAction(tk).catch(() => null);
      if (!live) return;
      setPrefs(p);
      setState(p ? "on" : "off");
    })();
    return () => { live = false; };
  }, [inApp]);

  async function change(on: boolean) {
    setBusy(true);
    try {
      let tk = token;
      if (on) {
        const r = await pushToken();
        if (r === "denied") { setState("denied"); setBusy(false); return; }
        tk = r;
      }
      if (!tk) throw new Error("no token");
      setToken(tk);
      const r = await setPushReminderAction(tk, on, Intl.DateTimeFormat().resolvedOptions().timeZone);
      if (!r.ok) throw new Error("not saved");
      setPrefs(r.on ? await pushPrefsAction(tk).catch(() => null) : null);
      setState(r.on ? "on" : "off");
      notify(s.reminderSaved);
    } catch {
      notify(s.reminderError);
    }
    setBusy(false);
  }

  async function update(patch: Partial<PushPrefs>) {
    if (!token || !prefs) return;
    const before = prefs;
    setPrefs({ ...prefs, ...patch });
    try {
      const saved = await setPushPrefsAction(token, patch);
      if (!saved) throw new Error("not saved");
      setPrefs(saved);
      notify(s.reminderSaved);
    } catch {
      setPrefs(before);
      notify(s.reminderError);
    }
  }

  if (!inApp || state === "loading" || state === "unavailable") return null;
  const on = state === "on";
  return (
    <section className="card stack-sm notify-card" aria-labelledby="set-reminder">
      <div className="notify-head">
        <span className="notify-badge" aria-hidden><Bell size={20} /></span>
        <h2 id="set-reminder">{s.reminderTitle}</h2>
        {state !== "denied" && <span className={`notify-status ${on ? "is-on" : ""}`}>{on ? s.reminderOn : s.reminderOff}</span>}
      </div>
      <p className="muted">{s.reminderBody}</p>
      {state === "denied" ? <p className="field-hint">{s.reminderDenied}</p> : on ? (
        <>
          {prefs && <NotifyKinds prefs={prefs} onChange={update} />}
          <button type="button" className="notify-off" disabled={busy} onClick={() => change(false)}>{s.reminderDisable}</button>
        </>
      ) : (
        <button type="button" className="btn btn--primary notify-enable" disabled={busy} onClick={() => change(true)}>{s.reminderEnable}</button>
      )}
    </section>
  );
}
