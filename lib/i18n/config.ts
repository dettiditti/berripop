/** Supported UI languages. Add a code here and a dictionary to add a language. */
export const locales = ["hu", "en"] as const;
export type Locale = (typeof locales)[number];

/** Mirrors the language choice so server-rendered screens (e.g. sign-in) can use it. */
export const LOCALE_COOKIE = "kozos-locale";

/** New users start in Hungarian. */
export const defaultLocale: Locale = "hu";

/** BCP 47 tags used for Intl date, number and plural formatting. */
export const intlTag: Record<Locale, string> = { hu: "hu-HU", en: "en-GB" };

/** How each language is labelled in the language selector. */
export const localeLabels: Record<Locale, { label: string; flag: string }> = {
  hu: { label: "Magyar", flag: "🇭🇺" },
  en: { label: "English", flag: "🇬🇧" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
