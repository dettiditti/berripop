import type { BerripopMood } from "@/components/berripop/BerripopMascot";
import { hash } from "./dates";
import type { Dictionary, MessageKey } from "./i18n/dictionaries";
import { fmt } from "./i18n/format";

export type { MessageKey };

/**
 * Berripop's lines live in each dictionary under `mascot.lines`. Every context
 * must be chosen from real app state: none of the lines claim that another
 * person did something.
 */

/** Moods that suit each context, so Berripop's face matches what he says. */
export const moodFor: Record<MessageKey, BerripopMood> = {
  "greeting.first": "excited",
  "greeting.ready": "happy",
  "greeting.done": "proud",
  "greeting.welcomeBack": "comforting",
  "greeting.restDay": "comforting",
  "greeting.streak": "excited",
  "greeting.journeyDone": "proud",
  "circle.solo": "curious",
  "circle.together": "happy",
  "quest.intro": "curious",
  "quest.empty": "thinking",
  "quest.writing": "encouraging",
  "quest.deeper": "excited",
  "quest.save": "happy",
  "celebrate.default": "excited",
  "celebrate.levelUp": "excited",
  "celebrate.week": "proud",
  "celebrate.edit": "comforting",
  "world.welcome": "curious",
  "world.saved": "comforting",
};

/**
 * Picks a variation in the current language. The seed (e.g. today's date)
 * keeps the line stable for a day instead of changing on every render.
 */
export function berripopSays(d: Dictionary, key: MessageKey, seed: string, vars: Record<string, string | number> = {}): string {
  const list = d.mascot.lines[key];
  return fmt(list[hash(`${key}:${seed}`) % list.length], vars);
}
