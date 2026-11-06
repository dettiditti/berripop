import { describe, expect, it } from "vitest";
import { cleanEmail, readWaitlist, WAITLIST_CONSENT_VERSION } from "../lib/waitlist";
import { dictionaries } from "../lib/i18n/dictionaries";
import { legal } from "../lib/legal/content";

describe("phone-app waitlist", () => {
  it("cleans and checks email addresses", () => {
    expect(cleanEmail("  Anna@Pelda.HU ")).toBe("anna@pelda.hu");
    for (const bad of ["", "anna", "anna@", "@pelda.hu", "anna@pelda", "a b@pelda.hu", 42, null, `${"x".repeat(250)}@a.hu`]) expect(cleanEmail(bad)).toBeNull();
  });

  it("needs the consent box ticked, never assumes it", () => {
    expect(readWaitlist({ email: "a@b.hu", consent: false, locale: "hu" })).toEqual({ ok: false, error: "consent" });
    expect(readWaitlist({ email: "a@b.hu", consent: "true", locale: "hu" })).toEqual({ ok: false, error: "consent" });
    expect(readWaitlist({ email: "nope", consent: true, locale: "hu" })).toEqual({ ok: false, error: "email" });
  });

  it("keeps only the address, a known language and the consent version", () => {
    expect(readWaitlist({ email: "A@B.hu", consent: true, locale: "en" })).toEqual({ ok: true, entry: { email: "a@b.hu", locale: "en", consentVersion: WAITLIST_CONSENT_VERSION } });
    expect(readWaitlist({ email: "a@b.hu", consent: true, locale: "xx" })).toMatchObject({ ok: true, entry: { locale: "hu" } });
  });

  it("drops bots that fill in the hidden field", () => {
    expect(readWaitlist({ email: "a@b.hu", consent: true, locale: "hu", website: "spam" })).toEqual({ ok: false, error: "bot" });
  });

  it("has the texts in both languages and mentions the list in the privacy policy", () => {
    for (const [loc, d] of Object.entries(dictionaries)) {
      const w = d.landing.appWaitlist;
      for (const v of Object.values(w)) expect(v.length).toBeGreaterThan(0);
      const policy = JSON.stringify(legal[loc as "hu" | "en"].docs.privacy);
      expect(policy).toMatch(loc === "hu" ? /mobilapp-értesítő/i : /phone-app notice/i);
    }
  });
});
