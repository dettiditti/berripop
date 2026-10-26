import { addDays, parseKey } from "../dates";
import { intlTag, type Locale } from "./config";
import { dictionaries, type Dictionary, type Plural } from "./dictionaries";

type Vars = Record<string, string | number>;

/** Fills `{name}` placeholders. Unknown placeholders are left visible so they're easy to spot. */
export function fmt(template: string, vars: Vars = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/**
 * Pure (non-hook) i18n helpers for a locale. Used by the client hook and
 * usable from server code, e.g. for metadata.
 */
export function makeI18n(locale: Locale) {
  const tag = intlTag[locale];
  const d: Dictionary = dictionaries[locale];
  const rules = new Intl.PluralRules(tag);
  const numbers = new Intl.NumberFormat(tag);
  const relative = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });

  const num = (n: number) => numbers.format(n);

  return {
    locale,
    d,
    /** Locale-aware price, e.g. "2990 Ft" / "HUF 2,990". Amount is in the major unit. */
    money: (amount: number, currency: string) => new Intl.NumberFormat(tag, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount),
    t: (template: string, vars?: Vars) => fmt(template, vars),
    /** Picks the right plural form for `n` and fills `{n}` (formatted) plus any other vars. */
    plural: (forms: Plural, n: number, vars: Vars = {}) => {
      const form = (forms as Record<string, string | undefined>)[rules.select(n)] ?? forms.other;
      return fmt(form, { ...vars, n: num(n) });
    },
    num,
    /** "long": weekday + day + month; "short": day + month. */
    date: (key: string, style: "long" | "short" = "short") =>
      parseKey(key).toLocaleDateString(tag, style === "long" ? { weekday: "long", month: "long", day: "numeric" } : { month: "short", day: "numeric" }),
    /** "Today", "Yesterday", "3 days ago"… within a week, otherwise a short date. */
    relativeDay: (key: string, today: string) => {
      for (let diff = 0; diff < 7; diff++) {
        if (addDays(today, -diff) === key) {
          const s = relative.format(-diff, "day");
          return s.charAt(0).toLocaleUpperCase(tag) + s.slice(1);
        }
      }
      return parseKey(key).toLocaleDateString(tag, { month: "short", day: "numeric" });
    },
  };
}

export type I18n = ReturnType<typeof makeI18n>;
