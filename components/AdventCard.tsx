"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, Lock, NotebookPen, Sparkles, Star } from "lucide-react";
import { ADVENT_DAYS, ADVENT_GIFTS, adventActive, nextWindow, windowState } from "@/lib/advent";
import { useI18n } from "@/lib/i18n/client";
import { getAdventAction, openAdventWindowAction } from "@/lib/server/actions";
import type { AdventState } from "@/lib/server/advent";
import { Sheet } from "./Modals";
import type { Run } from "./screens/types";

type Opened = { day: number; gift: string | null; fresh: boolean };

/**
 * The advent calendar on Today (1–31 December): a card offering today's window
 * (or a missed one), and the 24-window calendar in a sheet. What a window asks
 * is the same for everyone; anything the member writes about it goes to their
 * journal, only if they choose.
 */
export default function AdventCard({ today, run, notify, writeInJournal, onWorld, initial }: {
  today: string;
  run: Run;
  notify: (message: string) => void;
  writeInJournal: (starter: string) => void;
  onWorld: () => void;
  /** For previews: start from this state instead of loading it. */
  initial?: AdventState | null;
}) {
  const { d, t } = useI18n();
  const a = d.advent;
  const active = adventActive(today);
  const [state, setState] = useState<AdventState | null | undefined>(initial);
  const [sheet, setSheet] = useState(false);
  const [shown, setShown] = useState<Opened | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active || initial !== undefined) return;
    let live = true;
    getAdventAction().then(s => { if (live) setState(s); }).catch(() => {});
    return () => { live = false; };
  }, [active, today, initial]);

  const open = useCallback(async (day: number) => {
    if (busy) return;
    setBusy(true);
    const r = await run(openAdventWindowAction(day));
    setBusy(false);
    if (!r?.data) return notify(a.error);
    setState(r.data.state);
    setShown({ day, gift: r.data.gift, fresh: r.data.fresh });
    setSheet(true);
  }, [busy, run, notify, a.error]);

  if (!active || !state) return null;
  const opened = new Set(state.opened.map(w => w.day));
  const next = nextWindow(today, opened);
  const todayDay = Number(today.slice(8, 10));
  const allDone = opened.size >= ADVENT_DAYS;

  const title = allDone ? a.allDoneTitle
    : next === todayDay ? t(a.todayTitle, { n: next })
    : next ? t(a.missedTitle, { n: next })
    : a.doneTitle;
  const body = allDone ? a.allDoneBody : next === todayDay ? a.todayBody : next ? a.missedBody : a.doneBody;
  const itemName = (id: string) => (d.wardrobe.items as Record<string, string>)[id] ?? id;

  const close = () => { setSheet(false); setShown(null); };
  const show = (day: number) => {
    const w = state.opened.find(x => x.day === day);
    if (w) setShown({ day, gift: w.gift, fresh: false });
  };

  return (
    <>
      <section className="card advent-card" aria-labelledby="advent-title">
        <div className="advent-card-text">
          <span className="eyebrow">{a.eyebrow}</span>
          <h2 id="advent-title">{title}</h2>
          <p>{body}</p>
        </div>
        <div className="advent-card-actions">
          {next && <button className="btn btn--primary" disabled={busy} onClick={() => open(next)}><Gift size={16} /> {a.open}</button>}
          <button className="btn btn--white" onClick={() => setSheet(true)}>{a.calendar} · {t(a.opened, { n: opened.size })}</button>
        </div>
      </section>

      {sheet && (
        <Sheet title={shown ? t(a.windowLabel, { n: shown.day }) : a.sheetTitle} kicker={shown ? a.eyebrow : a.sheetKicker} onClose={close}>
          {shown ? (
            <div className="advent-window stack-sm">
              <p className="advent-prompt">{a.windows[shown.day - 1]}</p>
              <p className="advent-reward"><Star size={16} /> {a.reward}</p>
              {shown.gift && shown.gift !== "stars" && <p className="advent-gift"><Gift size={16} /> {t(a.gift, { item: itemName(shown.gift) })}</p>}
              {shown.gift === "stars" && <p className="advent-gift"><Sparkles size={16} /> {a.giftStars}</p>}
              <div className="sheet-actions">
                {shown.gift && shown.gift !== "stars" && <button className="btn btn--white" onClick={() => { close(); onWorld(); }}><Sparkles size={16} /> {a.toWorld}</button>}
                <button className="btn btn--primary" onClick={() => { const p = a.windows[shown.day - 1]; close(); writeInJournal(p); }}><NotebookPen size={16} /> {a.toJournal}</button>
              </div>
              <button className="btn btn--text" onClick={() => setShown(null)}>{a.calendar}</button>
            </div>
          ) : (
            <div className="advent-grid" role="list">
              {Array.from({ length: ADVENT_DAYS }, (_, i) => i + 1).map(day => {
                const s = windowState(day, today, opened);
                const gift = ADVENT_GIFTS[day];
                return (
                  <button
                    key={day}
                    role="listitem"
                    className={`advent-door is-${s}${gift ? " has-gift" : ""}`}
                    disabled={busy}
                    aria-label={`${t(a.windowLabel, { n: day })}${s === "locked" ? ` · ${t(a.locked, { n: day })}` : ""}`}
                    onClick={() => s === "opened" ? show(day) : s === "locked" ? notify(t(a.locked, { n: day })) : open(day)}
                  >
                    <span className="advent-door-num">{day}</span>
                    {s === "locked" ? <Lock size={12} aria-hidden /> : s === "opened" ? <Star size={12} aria-hidden /> : gift ? <Gift size={12} aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
