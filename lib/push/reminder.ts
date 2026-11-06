import type { Hunger } from "../berriHunger";
import type { Locale } from "../i18n/config";

/** An APNs device token: hex, 64 characters today, allowed to grow. */
export function isDeviceToken(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{64,200}$/i.test(v);
}

/**
 * The daily reminder's text, in Berri's voice and matched to how hungry Berri
 * is (lib/berriHunger). Fixed and general on purpose: a notification shows on
 * the lock screen, so it never names a goal, a question or anything the member
 * wrote. Never guilt: after a longer break Berri only says it thought of them.
 */
const TEXT: Record<Locale, Record<Hunger, { title: string; body: string }>> = {
  hu: {
    full: { title: "Berri itt van", body: "Pár perc csak magadra: vár a mai kérdésed." },
    peckish: { title: "Berri megéhezett 🫐", body: "Egy kérdés vagy egy „hogy vagy?” pont jólesne neki. 2 perc az egész." },
    hungry: { title: "Berri hasa korog 🫐", body: "Megetetnéd egy apró válasszal? Ha ma nincs kedved, az is rendben van." },
    missing: { title: "Berri gondolt rád 💜", body: "A világod megvár. Ha van egy perced, Berri nagyon örülne neked." },
  },
  en: {
    full: { title: "Berri is here", body: "A few minutes just for you: today's question is waiting." },
    peckish: { title: "Berri is a little hungry 🫐", body: "A question or a quick \"how are you?\" would hit the spot. Just 2 minutes." },
    hungry: { title: "Berri's tummy is rumbling 🫐", body: "Feed Berri a tiny answer? If today isn't the day, that's okay too." },
    missing: { title: "Berri thought of you 💜", body: "Your world will wait. If you have a minute, Berri would love to see you." },
  },
};

export function reminderText(locale: Locale, hunger: Hunger = "full"): { title: string; body: string } {
  return TEXT[locale][hunger];
}

export type ReminderDevice = { token: string; userId: string; lastSentDate: string | null };

/**
 * Who gets today's reminder: devices not reminded yet today, of members who
 * have not done today's step yet.
 */
export function devicesToRemind(devices: ReminderDevice[], doneToday: Set<string>, today: string): ReminderDevice[] {
  return devices.filter(d => d.lastSentDate !== today && !doneToday.has(d.userId));
}
