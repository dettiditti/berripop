"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, Lock, NotebookPen, Sparkles, Star } from "lucide-react";
import { ADVENT_DAYS, ADVENT_GIFTS, ADVENT_STAR_DAYS, adventActive, nextWindow, windowState } from "@/lib/advent";
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
export default function AdventCard({ today: realToday, run, notify, writeInJournal, onWorld, initial }: {
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
  const today = (initial === undefined && process.env.NEXT_PUBLIC_ADVENT_PREVIEW_DATE) || realToday; // ZZ-TEMP local preview
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
  const starDay = shown ? ADVENT_STAR_DAYS[shown.day] : undefined;
  const show = (day: number) => {
    const w = state.opened.find(x => x.day === day);
    if (w) setShown({ day, gift: w.gift, fresh: false });
  };

  return (
    <>
      <section className="card advent-card" aria-labelledby="advent-title">
        {/* eslint-disable-next-line @next/next/no-img-element -- transparent still, like public/berri/pose */}
        <img className="advent-card-berri" src="/berri/berri-xmas.png" alt="" width={611} height={720} />
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
            <div className={`advent-window${starDay ? " is-starday" : ""}`}>
              <div className="advent-window-hero" aria-hidden>
                <div className={`advent-pane-hero${shown.day === ADVENT_DAYS ? " is-eve" : ""}`}>
                  <span>{shown.day}</span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="advent-window-berri" src="/berri/berri-xmas.png" alt="" width={611} height={720} />
              </div>
              {starDay ? (
                <div className="advent-starday">
                  <p className="advent-prompt">{a.starDayTitle}</p>
                  <p className="advent-starday-body">{a.starDayBody}</p>
                </div>
              ) : <p className="advent-prompt">{a.windows[shown.day - 1]}</p>}
              <div className="advent-rewards">
                <span className="advent-chip is-star"><Star size={14} /> {starDay ? t(a.starDayReward, { n: starDay }) : a.reward}</span>
                {shown.gift && shown.gift !== "stars" && <span className="advent-chip is-gift"><Gift size={14} /> {t(a.gift, { item: itemName(shown.gift) })}</span>}
                {shown.gift === "stars" && <span className="advent-chip is-gift"><Sparkles size={14} /> {a.giftStars}</span>}
              </div>
              <div className="sheet-actions">
                {shown.gift && shown.gift !== "stars" && <button className="btn btn--white" onClick={() => { close(); onWorld(); }}><Sparkles size={16} /> {a.toWorld}</button>}
                {starDay
                  ? <button className="btn btn--primary" onClick={close}>{a.close}</button>
                  : <button className="btn btn--primary" onClick={() => { const p = a.windows[shown.day - 1]; close(); writeInJournal(p); }}><NotebookPen size={16} /> {a.toJournal}</button>}
              </div>
              <button className="btn btn--text" onClick={() => setShown(null)}>{a.calendar}</button>
            </div>
          ) : (
            <div className="advent-house">
              <div className="advent-roof" aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="advent-berri" src="/berri/berri-xmas.png" alt="" width={611} height={720} />
                <Roof />
              </div>
              <div className="advent-facade">
                <div className="advent-grid" role="list">
                  {Array.from({ length: ADVENT_DAYS }, (_, i) => i + 1).map(day => {
                    const s = windowState(day, today, opened);
                    const gift = ADVENT_GIFTS[day];
                    const stars = ADVENT_STAR_DAYS[day];
                    return (
                      <button
                        key={day}
                        role="listitem"
                        className={`advent-door is-${s}${gift ? " has-gift" : ""}${stars ? " has-stars" : ""}${day === ADVENT_DAYS ? " is-eve" : ""}`}
                        disabled={busy}
                        aria-current={s === "open" ? "date" : undefined}
                        aria-label={`${t(a.windowLabel, { n: day })}${stars ? ` · ${a.starDayLabel}` : ""}${s === "locked" ? ` · ${t(a.locked, { n: day })}` : ""}`}
                        onClick={() => s === "opened" ? show(day) : s === "locked" ? notify(t(a.locked, { n: day })) : open(day)}
                      >
                        <span className="advent-door-num">{day}</span>
                        {s === "opened" && <Star className="advent-door-mark" size={11} aria-hidden />}
                        {s === "locked" && day !== ADVENT_DAYS && <Lock className="advent-door-mark" size={10} aria-hidden />}
                        {gift && s !== "opened" && <Bow />}
                        {stars && s !== "opened" && <Sparkles className="advent-sparkle" size={13} aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

/** The snowy roof of the little house; Berri peeks over its ridge. */
function Roof() {
  return (
    <svg className="advent-roof-svg" viewBox="0 0 360 96" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="adv-roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a7fec" />
          <stop offset="1" stopColor="#7654d9" />
        </linearGradient>
      </defs>
      <rect x="276" y="14" width="26" height="44" rx="5" fill="#8a6fe2" />
      <rect x="272" y="10" width="34" height="9" rx="4.5" fill="#fff" />
      <path d="M8 88 L180 30 L352 88 Q356 96 346 96 L14 96 Q4 96 8 88 Z" fill="url(#adv-roof)" />
      <path d="M2 86 L180 24 L358 86 Q361 92 353 92 Q345 92 340 86 Q333 97 322 88 Q312 95 300 84 L180 42 L62 84 Q50 95 40 88 Q29 97 22 86 Q15 92 7 92 Q-1 92 2 86 Z" fill="#fff" />
    </svg>
  );
}

/** A tiny gold bow: this window holds a gift. */
function Bow() {
  return (
    <svg className="advent-bow" viewBox="0 0 20 14" aria-hidden>
      <path d="M10 7 C6 1 1 2 2 6 C3 10 7 9 10 7 Z M10 7 C14 1 19 2 18 6 C17 10 13 9 10 7 Z" fill="#e2b552" />
      <circle cx="10" cy="7" r="2.2" fill="#c9952f" />
    </svg>
  );
}
