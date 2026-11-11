import type { Locale } from "../i18n/config";

/** An APNs device token: hex, 64 characters today, allowed to grow. */
export function isDeviceToken(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{64,200}$/i.test(v);
}

/**
 * The afternoon reminder ("Don't forget yourself"): the same fixed text every
 * day, never written or varied by the AI. It shows on the lock screen, so it
 * never names a goal, a question, a mood or anything the member wrote.
 */
const TEXT: Record<Locale, { title: string; body: string }> = {
  hu: {
    title: "Hé, ne felejtsd el magad! 💜",
    body: "A mai napodban is legyen egy kis idő, ami csak rólad szól. Ugorj be Berripopba, nézd meg, hol tartasz, írj pár sort, vagy tegyél egy apró lépést önmagadért. Nem kell nagy dolgot véghezvinned.",
  },
  en: {
    title: "Hey, don't forget yourself! 💜",
    body: "Make a little time today that's just about you. Pop into Berripop, see where you are, write a few lines or take one small step for yourself. It doesn't have to be anything big.",
  },
};

export function reminderText(locale: Locale): { title: string; body: string } {
  return TEXT[locale];
}
