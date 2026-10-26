"use client";

import { useRef } from "react";
import { CalendarCheck } from "lucide-react";
import { parseKey } from "@/lib/dates";
import { recapTone, weeklyRecap } from "@/lib/domain/recap";
import type { View } from "@/lib/domain/view";
import { useI18n } from "@/lib/i18n/client";
import { trackAction } from "@/lib/server/actions";

/** The free weekly recap on Today: counted from the member's own records, no AI, no journal text. */
export default function WeeklyRecap({ view }: { view: View }) {
  const { d, t, plural, locale } = useI18n();
  const r = d.today.recap;
  const recap = weeklyRecap(view);
  const tracked = useRef(false);
  const weekday = (date: string) => parseKey(date).toLocaleDateString(locale === "hu" ? "hu-HU" : "en-GB", { weekday: "short" });

  return (
    <details
      className="card weekly-recap"
      onToggle={e => {
        if (!e.currentTarget.open || tracked.current) return;
        tracked.current = true;
        void trackAction("weekly_recap_viewed").catch(() => {});
      }}
    >
      <summary>
        <span className="eyebrow"><CalendarCheck size={13} /> {r.eyebrow}</span>
        <span className="weekly-recap-line">{r[recapTone(recap.activeDays)]}</span>
        <span className="weekly-recap-stats">
          <span className="pill">{plural(r.activeDays, recap.activeDays)}</span>
          {recap.answers > 0 && <span className="pill">{plural(r.answers, recap.answers)}</span>}
          {recap.journeyStops > 0 && <span className="pill">{plural(r.stops, recap.journeyStops)}</span>}
          {recap.xp > 0 && <span className="pill">{t(r.xp, { n: recap.xp })}</span>}
        </span>
        <span className="weekly-recap-more">{r.details}</span>
      </summary>
      <div className="weekly-recap-body stack-sm">
        <ol className="weekly-recap-days" aria-label={r.daysLabel}>
          {recap.days.map(day => (
            <li key={day.date} className={day.active ? "is-active" : ""} aria-label={t(day.active ? r.dayActive : r.dayIdle, { day: weekday(day.date) })}>
              <span aria-hidden>{weekday(day.date)}</span>
            </li>
          ))}
        </ol>
        {recap.topTheme && <p>{t(r.topTheme, { theme: d.themes[recap.topTheme].name })}</p>}
        {recap.moments > 0 && <p>{plural(r.moments, recap.moments)}</p>}
        {recap.badges.length > 0 && (
          <p>{t(r.badges, { names: recap.badges.map(id => d.gamification.badges[id as keyof typeof d.gamification.badges]?.name ?? id).join(", ") })}</p>
        )}
      </div>
    </details>
  );
}
