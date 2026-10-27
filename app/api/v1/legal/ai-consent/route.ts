import { getLegalStatus, setAiConsent } from "@/lib/server/legal";
import { PRIVATE, apiError, apiJson, readJsonObject, withBearer } from "@/lib/server/mobileApi";

/**
 * POST /api/v1/legal/ai-consent (mobile API): gives or withdraws consent to
 * AI processing, with the same rule as the web (lib/server/legal.ts
 * setAiConsent). Separate from the Terms: neither one ever records the other.
 *
 * Body: { "granted": true, "version": "<the AI notice version the app showed>" }
 *    or { "granted": false } to withdraw (always possible, any version).
 * Giving consent to any version but the server's current one is refused with
 * 409 { error: "outdated", aiConsentVersion }. Repeating the current state
 * records nothing new.
 *
 * 200 → { aiConsent, aiConsentVersion, aiConsentRequired }, read back from
 * the stored records.
 */

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return withBearer(req, async userId => {
    const body = await readJsonObject(req);
    const granted = body?.granted;
    const version = body?.version;
    if (typeof granted !== "boolean") return apiError(400, "invalid");
    if (granted && (typeof version !== "string" || !version || version.length > 64)) return apiError(400, "invalid");
    const r = await setAiConsent(userId, granted, typeof version === "string" ? version : "");
    const { aiConsent, aiConsentVersion, aiConsentRequired } = await getLegalStatus(userId);
    if (!r.ok) return Response.json({ error: "outdated", aiConsentVersion }, { status: 409, headers: PRIVATE });
    const stored = granted ? aiConsent === "granted" : aiConsent === "withdrawn" || aiConsent === "missing";
    return stored ? apiJson({ aiConsent, aiConsentVersion, aiConsentRequired }) : apiError(500, "internal");
  }, { provision: true });
}
