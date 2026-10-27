import { acceptTerms, getLegalStatus } from "@/lib/server/legal";
import { PRIVATE, apiError, apiJson, readJsonObject, withBearer } from "@/lib/server/mobileApi";

/**
 * POST /api/v1/legal/terms (mobile API): records that the member accepted
 * the Terms, with the same rule as the web (lib/server/legal.ts acceptTerms).
 *
 * Body: { "version": "<the Terms version the app showed>" }. Only the
 * server's current version is accepted: any other is refused with 409
 * { error: "outdated", termsVersion } so the app can show the current Terms
 * (GET /api/v1/me also carries legal.termsVersion). Accepting again is a
 * no-op; an outdated or withdrawn acceptance gets a new record. AI consent
 * is separate and never changed here.
 *
 * 200 → { terms: "granted", termsVersion }, read back from the stored records.
 */

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return withBearer(req, async userId => {
    const body = await readJsonObject(req);
    const version = body?.version;
    if (typeof version !== "string" || !version || version.length > 64) return apiError(400, "invalid");
    const r = await acceptTerms(userId, version);
    if (!r.ok) {
      const { termsVersion } = await getLegalStatus(userId);
      return Response.json({ error: "outdated", termsVersion }, { status: 409, headers: PRIVATE });
    }
    const { terms, termsVersion } = await getLegalStatus(userId);
    return terms === "granted" ? apiJson({ terms, termsVersion }) : apiError(500, "internal");
  }, { provision: true });
}
