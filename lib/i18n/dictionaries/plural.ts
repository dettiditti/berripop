/** Plural forms keyed by Intl.PluralRules categories. `one` and `other` cover hu and en. */
export type Plural = { one: string; other: string; zero?: string; two?: string; few?: string; many?: string };

export const pl = (one: string, other: string): Plural => ({ one, other });
