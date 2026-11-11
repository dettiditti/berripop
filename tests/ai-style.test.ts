import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HUNGARIAN_STYLE } from "../lib/ai/style";

describe("Berri's Hungarian", () => {
  it("every AI request carries the natural-Hungarian rule", () => {
    expect(HUNGARIAN_STYLE).toMatch(/native Hungarian/);
    expect(HUNGARIAN_STYLE).toMatch(/Légzésfigyelem/);
    expect(readFileSync("lib/server/ai.ts", "utf8")).toMatch(/\[req\.instructions, about, HUNGARIAN_STYLE\]/);
  });

  it("the Hungarian texts use no English loanwords for the check-in", () => {
    const hu = readFileSync("lib/i18n/dictionaries/hu.ts", "utf8");
    expect(hu).not.toMatch(/check-in/i);
    expect(hu).not.toMatch(/napló-reflexió/i);
  });
});
