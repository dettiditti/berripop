"use client";

import { useMemo, useState } from "react";
import { CalendarHeart, ChevronLeft, ChevronRight } from "lucide-react";
import { CHECKIN_STATES, MOOD_COLOR } from "@/lib/checkin/checkin";
import { monthGrid, monthOf, mostOften, shiftMonth, type Mood } from "@/lib/checkin/moodCalendar";
import { parseKey } from "@/lib/dates";
import { useI18n } from "@/lib/i18n/client";

/**
 * The mood calendar in My Inner World: each day coloured by the member's
 * "How are you today?" answer. Only the date and the chosen state are used,
 * never notes, and nothing is judged: every colour is a soft one.
 */
export default function MoodCalendar({ moods, today }: { moods: Mood[]; today: string }) {
  const { d, t, locale } = useI18n();
  const mc = d.moodCalendar;
  const states = d.checkin.states;
  const [month, setMonth] = useState(monthOf(today));
  const byDate = useMemo(() => new Map(moods.map(m => [m.date, m.state])), [moods]);
  const earliest = moods.length ? monthOf(moods[0].date) : monthOf(today);
  const loc = locale === "hu" ? "hu-HU" : "en-GB";
  const title = parseKey(`${month}-01`).toLocaleDateString(loc, { year: "numeric", month: "long" });
  const weekdays = Array.from({ length: 7 }, (_, i) => parseKey(`2024-01-0${i + 1}`).toLocaleDateString(loc, { weekday: "narrow" }));
  const top = mostOften(moods, month);

  return (
    <section className="card mood-calendar" aria-labelledby="mood-cal-title">
      <span className="eyebrow"><CalendarHeart size={13} aria-hidden /> {mc.title}</span>
      <p className="muted">{mc.intro}</p>
      <div className="mood-cal-head">
        <button type="button" className="mood-cal-nav" onClick={() => setMonth(shiftMonth(month, -1))} disabled={month <= earliest} aria-label={mc.prev}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        <h2 id="mood-cal-title">{title}</h2>
        <button type="button" className="mood-cal-nav" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= monthOf(today)} aria-label={mc.next}>
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>
      <div className="mood-cal-grid" role="list">
        {weekdays.map((w, i) => <span key={`w${i}`} className="mood-cal-weekday" aria-hidden>{w}</span>)}
        {monthGrid(month).map((date, i) => {
          if (!date) return <span key={`e${i}`} className="mood-cal-empty" aria-hidden />;
          const state = byDate.get(date);
          const label = parseKey(date).toLocaleDateString(loc, { month: "long", day: "numeric" });
          return (
            <span
              key={date}
              role="listitem"
              className={`mood-cal-day ${state ? "has-mood" : ""} ${date === today ? "is-today" : ""} ${date > today ? "is-future" : ""}`}
              style={state ? { background: MOOD_COLOR[state] } : undefined}
              aria-label={state ? t(mc.day, { date: label, state: states[state] }) : t(mc.noEntry, { date: label })}
            >
              {Number(date.slice(8))}
            </span>
          );
        })}
      </div>
      {!moods.length ? (
        <p className="muted mood-cal-empty-note">{mc.empty}</p>
      ) : (
        top && <p className="mood-cal-most">{t(mc.most, { state: states[top].toLowerCase() })}</p>
      )}
      <ul className="mood-cal-legend" aria-label={mc.legend}>
        {CHECKIN_STATES.map(s => (
          <li key={s}><i style={{ background: MOOD_COLOR[s] }} aria-hidden /> {states[s]}</li>
        ))}
      </ul>
    </section>
  );
}
