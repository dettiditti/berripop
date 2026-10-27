import { describe, expect, it } from "vitest";
import { PLAN_LIMITS, PRICES } from "../lib/billing/plans";
import { legal } from "../lib/legal/content";

/** Every string a legal page shows, per language. */
function texts(set: (typeof legal)["hu"]): string[] {
  const docs = Object.values(set.docs).flatMap(doc => [doc.title, doc.intro, ...doc.sections.flatMap(s => [s.heading, ...(s.body ?? []), ...(s.list ?? [])])]);
  return [set.back, set.updated, ...Object.values(set.nav), ...docs];
}

describe("public legal texts", () => {
  for (const [locale, set] of Object.entries(legal)) {
    it(`${locale}: has no placeholders, editor notes or draft markers`, () => {
      for (const text of texts(set)) {
        expect(text).not.toMatch(/\[\[|\]\]|TODO|Tervezet|Draft|jogi ellenőrzés|legal review/i);
        expect(text.trim()).not.toBe("");
      }
      for (const doc of Object.values(set.docs)) for (const s of doc.sections) expect((s.body?.length ?? 0) + (s.list?.length ?? 0)).toBeGreaterThan(0);
    });
  }

  it("has the same documents and sections in both languages", () => {
    for (const kind of Object.keys(legal.hu.docs) as (keyof typeof legal.hu.docs)[]) {
      const shape = (l: "hu" | "en") => legal[l].docs[kind].sections.map(s => [s.body?.length ?? 0, s.list?.length ?? 0]);
      expect(shape("en")).toEqual(shape("hu"));
    }
  });

  it("states the prices and free plan limits the app charges and enforces", () => {
    const hu = texts(legal.hu).join("\n");
    const en = texts(legal.en).join("\n");
    const grouped = (n: number, sep: string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    for (const p of Object.values(PRICES)) {
      expect(hu).toContain(`${grouped(p.amount, " ")} Ft`);
      expect(en).toContain(`HUF ${grouped(p.amount, ",")}`);
    }
    const f = PLAN_LIMITS.free;
    expect(hu).toContain(`${f.activeGoals} aktív cél, ${f.ownedCircles} saját kör, hetente ${f.aiPerPeriod} AI-segítség és ${f.journalAiPerPeriod} napló-reflexió`);
    expect(en).toContain(`${f.activeGoals} active goal, ${f.ownedCircles} circle of your own, ${f.aiPerPeriod} AI assists and ${f.journalAiPerPeriod} journal reflections a week`);
  });
});
