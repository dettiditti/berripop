"use client";

import { MOOD_COLORS, MOOD_COPY, MOOD_LABELS, MOODS, moodImage, type Mood } from "@/lib/journal/moods";
import { useI18n } from "@/lib/i18n/client";

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
/**
 * The seven feeling stickers as a radio group. Purely presentational: the
 * journal editor keeps the choice and saves it together with the entry.
 * Tapping the chosen one again clears it.
 */
export function MoodChoice({ value, onPick, size = 46, hint = true }: { value: Mood | null; onPick: (m: Mood | null) => void; size?: number; hint?: boolean }) {
  const { locale } = useI18n();
  const c = MOOD_COPY[locale];
  return (
    <fieldset className="mood-picker">
      <legend className="field-label">{c.question}</legend>
      <div className="mood-picker-row" role="radiogroup" aria-label={c.pick}>
        {MOODS.map((m, i) => (
          <button key={m} type="button" role="radio" aria-checked={value === m} className="mood-btn" onClick={() => onPick(value === m ? null : m)}>
            <MoodSticker mood={m} size={size} tilt={TILTS[i]} label />
          </button>
        ))}
      </div>
      {hint && <small className="muted mood-picker-hint">{c.hint}</small>}
    </fieldset>
  );
}
