"use client";

import type { ReactNode } from "react";
import { Sparkles, Sunrise, Sunset } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { REMIND_HOURS, THOUGHT_HOURS, type PushPrefs } from "@/lib/push/schedule";

/** A row with an icon, a label and a switch on the right. */
function SwitchRow({ icon, title, hint, checked, onChange, small }: {
  icon: ReactNode; title: string; hint: string; checked: boolean; onChange: (on: boolean) => void; small?: boolean;
}) {
  return (
    <label className={`notify-row ${small ? "notify-row--sub" : ""}`}>
      <span className="notify-icon" aria-hidden>{icon}</span>
      <span className="notify-text"><strong>{title}</strong><small>{hint}</small></span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden><i /></span>
    </label>
  );
}

/** The hours on offer as tappable chips (a radio group). */
function HourChips({ label, hours, value, onPick }: { label: string; hours: readonly number[]; value: number; onPick: (h: number) => void }) {
  return (
    <div className="notify-hours" role="radiogroup" aria-label={label}>
      {hours.map(h => (
        <button key={h} type="button" role="radio" aria-checked={value === h} className={`notify-hour ${value === h ? "is-on" : ""}`} onClick={() => onPick(h)}>
          {h}:00
        </button>
      ))}
    </div>
  );
}

/**
 * The two notifications as tiles: Berri's morning thought (with "fitted to
 * me") and the afternoon "Don't forget yourself" reminder. Each has its own
 * switch; its hours show only while it is on.
 */
export default function NotifyKinds({ prefs, onChange }: { prefs: PushPrefs; onChange: (patch: Partial<PushPrefs>) => void }) {
  const { d } = useI18n();
  const s = d.settings;
  return (
    <div className="notify-kinds">
      <div className={`notify-tile tone-coral ${prefs.thought ? "" : "is-off"}`}>
        <SwitchRow icon={<Sunrise size={22} />} title={s.notifyThought} hint={s.notifyThoughtHint} checked={prefs.thought} onChange={on => onChange({ thought: on })} />
        {prefs.thought && (
          <>
            <HourChips label={`${s.notifyThought}: ${s.notifyAt}`} hours={THOUGHT_HOURS} value={prefs.thoughtHour} onPick={h => onChange({ thoughtHour: h })} />
            <SwitchRow small icon={<Sparkles size={16} />} title={s.notifyPersonal} hint={s.notifyPersonalHint} checked={prefs.personalize} onChange={on => onChange({ personalize: on })} />
          </>
        )}
      </div>
      <div className={`notify-tile tone-purple ${prefs.remind ? "" : "is-off"}`}>
        <SwitchRow icon={<Sunset size={22} />} title={s.notifyRemind} hint={s.notifyRemindHint} checked={prefs.remind} onChange={on => onChange({ remind: on })} />
        {prefs.remind && <HourChips label={`${s.notifyRemind}: ${s.notifyAt}`} hours={REMIND_HOURS} value={prefs.remindHour} onPick={h => onChange({ remindHour: h })} />}
      </div>
    </div>
  );
}
