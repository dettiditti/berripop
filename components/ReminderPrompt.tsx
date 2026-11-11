"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { hapticSuccess, pushPermission, pushToken } from "@/lib/nativeBridge";
import { setPushReminderAction } from "@/lib/server/actions";
import BerripopMascot from "./berripop/BerripopMascot";
import { Sheet } from "./Modals";

const ASKED = "berripop.reminderAsked";

function askedBefore(): boolean {
  try {
    return window.localStorage.getItem(ASKED) === "1";
  } catch {
    return false;
  }
}
function markAsked() {
  try {
    window.localStorage.setItem(ASKED, "1");
  } catch {
    // Blocked storage: the offer may come once more, which is harmless.
  }
}

/**
 * iPhone app only, once per phone, right after the member's path is ready:
 * "Shall I remind you tomorrow?". Yes asks iOS for permission (only now) and
 * saves the phone's token, the same as the switch in settings; Not now just
 * closes. Not shown when this phone can't get notifications, was already
 * asked, or has already said yes or no to iOS.
 */
export default function ReminderPrompt({ onClose, notify }: { onClose: () => void; notify: (message: string) => void }) {
  const { d } = useI18n();
  const r = d.appStart.reminder;
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      if (askedBefore()) return onClose();
      const permission = await pushPermission();
      if (!live) return;
      // Only a phone that has never been asked: a yes or no given before is respected.
      if (permission !== "prompt") return onClose();
      setShow(true);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    markAsked();
    onClose();
  }

  async function yes() {
    setBusy(true);
    markAsked();
    try {
      const tk = await pushToken();
      if (tk === "denied") notify(r.denied);
      else if (tk && (await setPushReminderAction(tk, true, Intl.DateTimeFormat().resolvedOptions().timeZone)).ok) {
        hapticSuccess();
        notify(r.on);
      } else notify(d.settings.reminderError);
    } catch {
      notify(d.settings.reminderError);
    }
    onClose();
  }

  if (!show) return null;
  return (
    <Sheet title={r.title} kicker={r.kicker} onClose={close}>
      <div className="reminder-prompt">
        <BerripopMascot mood="excited" size={72} />
        <p>{r.body}</p>
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn btn--primary btn--lg btn--block" disabled={busy} onClick={yes}><Bell size={18} aria-hidden /> {r.yes}</button>
        <button type="button" className="btn btn--ghost btn--block" disabled={busy} onClick={close}>{r.no}</button>
      </div>
    </Sheet>
  );
}
