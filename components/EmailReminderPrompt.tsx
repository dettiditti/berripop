"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { setEmailReminderAction } from "@/lib/server/actions";
import BerripopMascot from "./berripop/BerripopMascot";
import { Sheet } from "./Modals";

/**
 * On the website, once per account: "Shall I remind you by email?". Only a
 * yes turns reminders on; "Not now" is recorded as a no, so it is not
 * offered again. Closing it records nothing (it may come back on a later
 * visit). Nobody is signed up without saying yes; both can be changed in
 * Settings.
 */
export default function EmailReminderPrompt({ onDone, notify }: { onDone: () => void; notify: (message: string) => void }) {
  const { d } = useI18n();
  const e = d.emailReminder;
  const [busy, setBusy] = useState(false);

  async function answer(on: boolean) {
    setBusy(true);
    try {
      const r = await setEmailReminderAction(on, "popup");
      notify(r.ok ? (on ? e.on : e.off) : e.error);
    } catch {
      notify(e.error);
    }
    onDone();
  }

  return (
    <Sheet title={e.title} kicker={e.kicker} onClose={() => !busy && onDone()}>
      <div className="reminder-prompt">
        <BerripopMascot mood="excited" size={72} />
        <div className="stack-sm">
          <p>{e.body}</p>
          <p className="muted">{e.private}</p>
        </div>
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn btn--primary btn--lg btn--block" disabled={busy} onClick={() => answer(true)}><Mail size={18} aria-hidden /> {e.yes}</button>
        <button type="button" className="btn btn--ghost btn--block" disabled={busy} onClick={() => answer(false)}>{e.no}</button>
      </div>
    </Sheet>
  );
}
