import type { Locale } from "../config";
import { en } from "./en";
import { hu } from "./hu";

export type { Plural } from "./plural";

/** The dictionary shape, defined by the English dictionary. */
export type Dictionary = typeof en;
export type BuiltInQuestionId = keyof Dictionary["content"]["questions"];
export type MessageKey = keyof Dictionary["mascot"]["lines"];

export const dictionaries: Record<Locale, Dictionary> = { hu, en };

/** Server-safe accessor, e.g. for metadata. */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
