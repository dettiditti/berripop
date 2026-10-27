/**
 * Versions of the legal documents and notices, and the pure rules that read a
 * member's legal records (unit-tested; storage is in lib/server/legal.ts).
 *
 * Bump a version when the wording changes in a way members must see again:
 * - terms: every member is asked to accept the new Terms before continuing.
 * - aiConsent: AI features pause until the member consents to the new notice.
 * Privacy and checkout notices are informational: their versions are shown
 * and recorded, never "accepted".
 */
export const LEGAL_VERSIONS = {
  terms: "2026-10-27",
  privacy: "2026-10-27",
  cookies: "2026-10-27",
  aiConsent: "2026-10-27",
  checkoutDisclosure: "2026-10-27",
} as const;

export type LegalRecordKind = "terms" | "ai_processing" | "checkout_disclosure";

export type LegalRecordRow = { kind: string; version: string; granted: boolean; createdAt: Date };

/** granted: the latest record is a grant of the current version. */
export type LegalState = "granted" | "withdrawn" | "outdated" | "missing";

export type LegalStatus = {
  terms: LegalState;
  termsVersion: string;
  aiConsent: LegalState;
  aiConsentVersion: string;
  aiConsentRequired: boolean;
};

export function legalState(rows: LegalRecordRow[], kind: LegalRecordKind, currentVersion: string): LegalState {
  const latest = rows
    .filter(r => r.kind === kind)
    .reduce<LegalRecordRow | null>((a, r) => (!a || r.createdAt.getTime() >= a.createdAt.getTime() ? r : a), null);
  if (!latest) return "missing";
  if (!latest.granted) return "withdrawn";
  return latest.version === currentVersion ? "granted" : "outdated";
}

/**
 * Whether AI features need the member's separate, recorded consent. Required
 * unless AI_CONSENT_MODE is explicitly "not_required" (to be set only after a
 * lawyer approves another legal basis for AI processing of journal content).
 */
export function aiConsentRequired(env: Record<string, string | undefined>): boolean {
  return env.AI_CONSENT_MODE !== "not_required";
}
