"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { pushPermission, pushToken } from "@/lib/nativeBridge";
import { pushReminderStatusAction, setPushReminderAction } from "@/lib/server/actions";
import { useNativeApp } from "./useNativeApp";

/**
 * Settings, iPhone app only: the daily reminder for this phone. Turning it on
 * asks iOS for permission (only now, never on first launch) and stores the
 * phone's token; turning it off deletes it.
 */
export default function ReminderCard({ notify }: { notify: (message: string) => void }) {
  const inApp = useNativeApp();
  const { d } = useI18n();
  const s = d.settings;
  const [state, setState] = useState<"loading" | "on" | "off" | "denied" | "unavailable">("loading");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      setState((await pushReminderStatusAction(tk).catch(() => false)) ? "on" : "off");
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
      const r = await setPushReminderAction(tk, on);
      if (!r.ok) throw new Error("not saved");
      setState(r.on ? "on" : "off");
      notify(s.reminderSaved);
    } catch {
      notify(s.reminderError);
    }
    setBusy(false);
  }

  if (!inApp || state === "loading" || state === "unavailable") return null;
  return (
    <section className="card stack-sm" aria-labelledby="set-reminder">
      <h2 id="set-reminder"><Bell size={18} aria-hidden /> {s.reminderTitle}</h2>
      <p className="muted">{s.reminderBody}</p>
      {state === "denied" ? <p className="field-hint">{s.reminderDenied}</p> : (
        <>
          <strong>{state === "on" ? s.reminderOn : s.reminderOff}</strong>
          {state === "on" ? (
            <button type="button" className="btn btn--ghost btn--sm settings-inline-btn" disabled={busy} onClick={() => change(false)}>{s.reminderDisable}</button>
          ) : (
            <button type="button" className="btn btn--primary btn--sm settings-inline-btn" disabled={busy} onClick={() => change(true)}>{s.reminderEnable}</button>
          )}
        </>
      )}
    </section>
  );
}
