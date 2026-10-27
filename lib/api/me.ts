import type { Entitlements } from "../billing/entitlements";
import type { LegalStatus } from "../legal/records";

/**
 * GET /api/v1/me: who the token belongs to, their plan and their legal state.
 * Every field is picked explicitly, so nothing else (payment ids, journal or
 * check-in content, tokens) can slip into the response.
 */
export type MeResponse = {
  user: { id: string };
  entitlements: Pick<Entitlements, "plan" | "status" | "interval" | "currentPeriodEnd" | "cancelAtPeriodEnd" | "paymentIssue" | "ended" | "limits">;
  legal: Pick<LegalStatus, "terms" | "termsVersion" | "aiConsent" | "aiConsentVersion" | "aiConsentRequired">;
};

export function meResponse(userId: string, ent: Entitlements, legal: LegalStatus): MeResponse {
  return {
    user: { id: userId },
    entitlements: {
      plan: ent.plan,
      status: ent.status,
      interval: ent.interval,
      currentPeriodEnd: ent.currentPeriodEnd,
      cancelAtPeriodEnd: ent.cancelAtPeriodEnd,
      paymentIssue: ent.paymentIssue,
      ended: ent.ended,
      limits: { ...ent.limits },
    },
    legal: {
      terms: legal.terms,
      termsVersion: legal.termsVersion,
      aiConsent: legal.aiConsent,
      aiConsentVersion: legal.aiConsentVersion,
      aiConsentRequired: legal.aiConsentRequired,
    },
  };
}
