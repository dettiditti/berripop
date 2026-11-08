"use client";

import { useState } from "react";
import { MOOD_COLORS, MOOD_COPY, MOOD_LABELS, MOODS, moodImage, type Mood } from "@/lib/journal/moods";
import type { JournalResult } from "@/lib/journal/types";
import { useI18n } from "@/lib/i18n/client";
import { setEntryMoodAction } from "@/lib/server/actions";

/** A round Berri sticker for one feeling. Decorative unless `label` is shown. */
export function MoodSticker({ mood, size = 40, tilt = 0, label = false }: { mood: Mood; size?: number; tilt?: number; label?: boolean }) {
  const { locale } = useI18n();
  return (
    <span className="mood-sticker" style={{ "--s": `${size}px`, "--t": `${tilt}deg`, "--c": MOOD_COLORS[mood] } as React.CSSProperties}>
      <span className="mood-sticker-disc">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={moodImage(mood)} alt={label ? "" : MOOD_LABELS[locale][mood]} width={size} height={size} loading="lazy" decoding="async" />
      </span>
      {label && <span className="mood-sticker-label">{MOOD_LABELS[locale][mood]}</span>}
    </span>
  );
}

const TILTS = [-6, 4, -3, 6, -5, 3, -4];

/**
 * Pick (or clear) the feeling sticker of a saved entry. Saves right away;
 * the mood is the owner's own data and never goes to AI or analytics.
 */
export function MoodPicker({ entryId, value, onResult }: { entryId: string; value: Mood | null; onResult: (res: JournalResult) => boolean }) {
  const { locale } = useI18n();
  const c = MOOD_COPY[locale];
  const [current, setCurrent] = useState<Mood | null>(value);
  const [busy, setBusy] = useState(false);

  async function pick(m: Mood | null) {
    if (busy) return;
    const prev = current;
    setCurrent(m);
    setBusy(true);
    try {
      if (!onResult(await setEntryMoodAction(entryId, m))) setCurrent(prev);
    } catch {
      setCurrent(prev);
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="mood-picker" aria-busy={busy}>
      <legend className="field-label">{c.question}</legend>
      <div className="mood-picker-row" role="radiogroup" aria-label={c.pick}>
        {MOODS.map((m, i) => (
          <button key={m} type="button" role="radio" aria-checked={current === m} className="mood-btn" onClick={() => void pick(current === m ? null : m)}>
            <MoodSticker mood={m} size={52} tilt={TILTS[i]} label />
          </button>
        ))}
      </div>
      <small className="muted">{c.hint}</small>
    </fieldset>
  );
}
