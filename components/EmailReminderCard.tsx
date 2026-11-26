"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { getEmailReminderAction, setEmailReminderAction } from "@/lib/server/actions";

/** Settings: the opt-in email reminder (on, or off: never asked counts as off). */
export default function EmailReminderCard({ notify }: { notify: (message: string) => void }) {
  const { d } = useI18n();
  const e = d.emailReminder;
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getEmailReminderAction().then(r => setOn(r.ok ? r.state === "on" : null)).catch(() => setOn(null));
  }, []);

  async function change(next: boolean) {
    setBusy(true);
    try {
      const r = await setEmailReminderAction(next, "settings");
      if (!r.ok) throw new Error("not saved");
      setOn(r.state === "on");
      notify(r.state === "on" ? e.on : e.off);
    } catch {
      notify(e.error);
    }
    setBusy(false);
  }

  if (on === null) return null;
  return (
    <section className="card stack-sm" aria-labelledby="set-email-reminder">
      <h2 id="set-email-reminder"><Mail size={18} aria-hidden /> {e.settingsTitle}</h2>
      <p className="muted">{e.settingsBody}</p>
      <strong>{on ? e.settingsOn : e.settingsOff}</strong>
      {on ? (
        <button type="button" className="btn btn--ghost btn--sm settings-inline-btn" disabled={busy} onClick={() => change(false)}>{e.turnOff}</button>
      ) : (
        <button type="button" className="btn btn--primary btn--sm settings-inline-btn" disabled={busy} onClick={() => change(true)}>{e.turnOn}</button>
      )}
    </section>
  );
}
