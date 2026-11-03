import { describe, expect, it } from "vitest";
import { hu } from "../lib/i18n/dictionaries/hu";
import { en } from "../lib/i18n/dictionaries/en";
import { LEGAL_VERSIONS } from "../lib/legal/records";

/*
 * The AI consent wording in the app: simpler and without vendor or
 * infrastructure names (those stay in the Privacy Policy), but still saying
 * what is processed, by an external service, that it can include sensitive
 * data, that it is optional and how to withdraw. The notice version is not
 * bumped, so existing consents stay valid.
 */

const flat = (v: unknown): string => (typeof v === "string" ? v : Array.isArray(v) ? v.map(flat).join(" ") : v && typeof v === "object" ? Object.values(v).map(flat).join(" ") : "");

describe.each([["hu", hu], ["en", en]] as const)("%s AI copy", (_, d) => {
  const userFacing = flat([d.aiConsentDialog, d.aiAssist, d.journal.reflectDisclosure, d.journal.useInsightsHint, d.settings.aiBody, d.assessment]);

  it("names no AI vendor or infrastructure", () => {
    expect(userFacing).not.toMatch(/OpenAI|Vercel|Gateway|GPT/i);
  });

  it("the consent dialog still covers what consent needs", () => {
    const c = flat(d.aiConsentDialog);
    expect(c).toMatch(d === hu ? /külső AI-szolgáltatás/ : /external AI service/);
    expect(c).toMatch(d === hu ? /egészségedről|lelkiállapotodról/ : /wellbeing or health/);
    expect(c).toMatch(d === hu ? /visszavonhatod/ : /withdraw/);
    expect(c).toMatch(d === hu ? /nélküle is használhatod/ : /works without it/);
    expect(d.aiConsentDialog.privacyLink.length).toBeGreaterThan(0);
  });
});

describe("Hungarian consent dialog", () => {
  it("uses the agreed wording", () => {
    expect(hu.aiConsentDialog.title).toBe("Gondolkodjunk együtt? 💜");
    expect(hu.aiConsentDialog.checkbox).toBe("Hozzájárulok, hogy az általam kért AI-funkciókhoz szükséges szövegeimet külső AI-szolgáltatás feldolgozza.");
    expect(hu.aiConsentDialog.accept).toBe("Hozzájárulok és folytatom ✨");
    expect(hu.aiConsentDialog.later).toBe("Most nem");
  });
});

describe("consent version", () => {
  it("is unchanged by this rewording, so no member's consent becomes outdated", () => {
    expect(LEGAL_VERSIONS.aiConsent).toBe("2026-10-27.2");
  });
});
