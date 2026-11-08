import type { Locale } from "../i18n/config";

/**
 * Feeling stickers a member can pin to a journal entry: a few basic emotions,
 * each with its Berri sticker. Optional; never sent to AI or analytics.
 */
export const MOODS = ["boldog", "nyugodt", "meglepett", "szomoru", "felos", "merges", "faradt"] as const;
export type Mood = (typeof MOODS)[number];
export const isMood = (v: unknown): v is Mood => typeof v === "string" && (MOODS as readonly string[]).includes(v);

export const MOOD_LABELS: Record<Locale, Record<Mood, string>> = {
  hu: { boldog: "Boldog", nyugodt: "Nyugodt", meglepett: "Meglepett", szomoru: "Szomorú", felos: "Félős", merges: "Mérges", faradt: "Fáradt" },
  en: { boldog: "Happy", nyugodt: "Calm", meglepett: "Surprised", szomoru: "Sad", felos: "Scared", merges: "Angry", faradt: "Tired" },
};

export const MOOD_COLORS: Record<Mood, string> = {
  boldog: "#ffd36b", nyugodt: "#a8e3cf", meglepett: "#f9c3a8", szomoru: "#a9c8f2", felos: "#c9b8f2", merges: "#f4a3a3", faradt: "#d6cfe0",
};

export const moodImage = (m: Mood) => `/stickers/${m}.jpg`;

export const MOOD_COPY: Record<Locale, { question: string; hint: string; clear: string; change: string; pick: string; week: string; noMood: string }> = {
  hu: { question: "Milyen érzés volt?", hint: "Választható. Csak te látod, és nem kerül az AI-hoz.", clear: "Nincs matrica", change: "Érzés", pick: "Érzés matrica", week: "A heted érzései", noMood: "nincs matrica" },
  en: { question: "How did it feel?", hint: "Optional. Only you see it, and it is never sent to the AI.", clear: "No sticker", change: "Feeling", pick: "Feeling sticker", week: "Your week's feelings", noMood: "no sticker" },
};

/**
 * The last seven days (oldest first) with the feeling of that day's latest
 * entry that has one. `entries` are newest first, as the journal lists them.
 */
export function weekMoods(entries: { entryDate: string; mood?: Mood | null }[], dayKeys: string[]): (Mood | null)[] {
  return dayKeys.map(day => entries.find(e => e.entryDate === day && e.mood)?.mood ?? null);
}
