import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { legalRecords } from "../db/schema";
import { aiConsentRequired, LEGAL_VERSIONS, legalState, type LegalRecordKind, type LegalStatus } from "../legal/records";

/*
 * Terms acceptance, AI consent and checkout notices, stored as an append-only
 * log in legal_records (see lib/legal/records.ts for the rules).
 */

export type { LegalStatus };

async function rowsFor(userId: string, kinds: LegalRecordKind[]) {
  return getDb()
    .select({ kind: legalRecords.kind, version: legalRecords.version, granted: legalRecords.granted, createdAt: legalRecords.createdAt })
    .from(legalRecords)
    .where(and(eq(legalRecords.userId, userId), inArray(legalRecords.kind, kinds)))
    .orderBy(desc(legalRecords.createdAt));
}

export async function getLegalStatus(userId: string): Promise<LegalStatus> {
  const rows = await rowsFor(userId, ["terms", "ai_processing"]);
  return {
    terms: legalState(rows, "terms", LEGAL_VERSIONS.terms),
    termsVersion: LEGAL_VERSIONS.terms,
    aiConsent: legalState(rows, "ai_processing", LEGAL_VERSIONS.aiConsent),
    aiConsentVersion: LEGAL_VERSIONS.aiConsent,
    aiConsentRequired: aiConsentRequired(process.env),
  };
}

/** Records acceptance of the Terms the member was shown; a stale version is refused. */
export async function acceptTerms(userId: string, version: string): Promise<{ ok: true } | { ok: false; error: "outdated" }> {
  if (version !== LEGAL_VERSIONS.terms) return { ok: false, error: "outdated" };
  const rows = await rowsFor(userId, ["terms"]);
  if (legalState(rows, "terms", LEGAL_VERSIONS.terms) !== "granted") {
    await getDb().insert(legalRecords).values({ userId, kind: "terms", version, granted: true });
  }
  return { ok: true };
}

/** Gives (for the notice version shown) or withdraws consent to AI processing. */
export async function setAiConsent(userId: string, granted: boolean, version: string): Promise<{ ok: true } | { ok: false; error: "outdated" }> {
  if (granted && version !== LEGAL_VERSIONS.aiConsent) return { ok: false, error: "outdated" };
  const state = legalState(await rowsFor(userId, ["ai_processing"]), "ai_processing", LEGAL_VERSIONS.aiConsent);
  const unchanged = granted ? state === "granted" : state === "withdrawn" || state === "missing";
  if (!unchanged) await getDb().insert(legalRecords).values({ userId, kind: "ai_processing", version: LEGAL_VERSIONS.aiConsent, granted });
  return { ok: true };
}

/** May AI process this member's content right now? */
export async function aiAllowedFor(userId: string): Promise<boolean> {
  if (!aiConsentRequired(process.env)) return true;
  return legalState(await rowsFor(userId, ["ai_processing"]), "ai_processing", LEGAL_VERSIONS.aiConsent) === "granted";
}

/** Records which pre-payment notice was shown for a Checkout Session. */
export async function recordCheckoutDisclosure(userId: string, checkoutSessionId: string): Promise<void> {
  await getDb().insert(legalRecords).values({ userId, kind: "checkout_disclosure", version: LEGAL_VERSIONS.checkoutDisclosure, granted: true, context: checkoutSessionId });
}
