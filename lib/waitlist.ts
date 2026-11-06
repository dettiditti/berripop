import { isLocale, type Locale } from "./i18n/config";

/**
 * The phone-app waitlist on the landing page: a visitor leaves an email
 * address to hear once the app launches. Only the address, the language and
 * the version of the consent wording they ticked are kept. The address is
 * used for the launch notice only, never a newsletter.
 *
 * Bump the version whenever the consent sentence (landing.appWaitlist.consent)
 * changes, so each row records the wording that was actually agreed to.
 */
export const WAITLIST_CONSENT_VERSION = "2026-11-06";

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** A trimmed, lower-cased email address, or null if it does not look like one. */
export function cleanEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
}

export type WaitlistInput = { email: unknown; consent: unknown; locale: unknown; website?: unknown };
export type WaitlistEntry = { email: string; locale: Locale; consentVersion: string };
export type WaitlistError = "email" | "consent";

/**
 * Checks a sign-up. The consent box must be ticked (never assumed). `website`
 * is a hidden field people never fill in; when a bot does, the entry is
 * dropped quietly ("bot") and the visitor still sees the thank-you.
 */
export function readWaitlist(input: WaitlistInput): { ok: true; entry: WaitlistEntry } | { ok: false; error: WaitlistError | "bot" } {
  if (typeof input.website === "string" && input.website.trim() !== "") return { ok: false, error: "bot" };
  const email = cleanEmail(input.email);
  if (!email) return { ok: false, error: "email" };
  if (input.consent !== true) return { ok: false, error: "consent" };
  return { ok: true, entry: { email, locale: isLocale(input.locale) ? input.locale : "hu", consentVersion: WAITLIST_CONSENT_VERSION } };
}
