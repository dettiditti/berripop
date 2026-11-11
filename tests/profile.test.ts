import { describe, expect, it } from "vitest";
import { AGE_CHOICES, AGE_RANGES, cleanProfile, GENDERS, profileInstruction } from "../lib/profile/model";
import { dictionaries } from "../lib/i18n/dictionaries";

describe("member profile (age range and gender)", () => {
  it("keeps only known values", () => {
    expect(cleanProfile({ ageRange: "25_34", gender: "woman", extra: "x" })).toEqual({ ageRange: "25_34", gender: "woman" });
    expect(cleanProfile({ ageRange: "under16", gender: 3 })).toEqual({});
    expect(cleanProfile(null)).toEqual({});
  });

  it("tells the AI only what was shared, and only for tone", () => {
    expect(profileInstruction({})).toBe("");
    expect(profileInstruction({ gender: "unsaid" })).toBe("");
    const both = profileInstruction({ ageRange: "25_34", gender: "woman" });
    expect(both).toContain("a woman, 25-34 years old");
    expect(both).toContain("do not mention it");
    expect(profileInstruction({ ageRange: "55_plus" })).toContain("55 or older");
    expect(profileInstruction({ gender: "other" })).toContain("non-binary");
  });

  it("has a label for every choice in both languages", () => {
    for (const d of Object.values(dictionaries)) {
      for (const k of AGE_CHOICES) expect(d.aboutYou.age[k]).toBeTruthy();
      for (const k of GENDERS) expect(d.aboutYou.gender[k]).toBeTruthy();
    }
    expect(AGE_RANGES).not.toContain("under16");
  });
});
