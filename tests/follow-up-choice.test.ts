import { describe, expect, it } from "vitest";
import { chooseFollowUp, restoredSuggestion } from "../lib/ai/follow-up";
import { hu } from "../lib/i18n/dictionaries/hu";
import { en } from "../lib/i18n/dictionaries/en";
import { makeI18n } from "../lib/i18n/format";

/*
 * Choosing Berripop's AI follow-up question ("Ezt választom"): it becomes the
 * reflection prompt, nothing written is touched, and it is a plain state
 * change, so there is no second AI request and no allowance use.
 */

const draft = { text: "Ma végre kimondtam, amit gondolok.", reflection: "Megkönnyebbültem.", prompt: "" };
const q = "Mi segített abban, hogy most ki merd mondani?";

describe("choosing the AI question", () => {
  it("makes it the reflection prompt and keeps the answer and the reflection text", () => {
    expect(chooseFollowUp(draft, q)).toEqual({ ...draft, prompt: q });
  });

  it("replaces a built-in prompt chosen earlier", () => {
    expect(chooseFollowUp({ ...draft, prompt: "Mit kezeltél ma jól?" }, q).prompt).toBe(q);
  });

  it("a repeated click changes nothing (same object, so no rerender or second action)", () => {
    const once = chooseFollowUp(draft, q);
    expect(chooseFollowUp(once, q)).toBe(once);
  });

  it("is synchronous and pure: no request is made, so nothing is charged again", () => {
    const r = chooseFollowUp(draft, q);
    expect(r).not.toBeInstanceOf(Promise);
    expect(draft.prompt).toBe("");
  });
});

describe("a reopened draft", () => {
  const builtIn = ["Mit kezeltél ma jól?", "Miért vagy most hálás?"];
  it("shows an AI question chosen earlier as chosen, instead of offering a new request", () => {
    expect(restoredSuggestion(q, builtIn)).toBe(q);
  });
  it("a built-in prompt or no prompt brings back no AI question", () => {
    expect(restoredSuggestion("Mit kezeltél ma jól?", builtIn)).toBeNull();
    expect(restoredSuggestion("", builtIn)).toBeNull();
  });
});

describe("question copy", () => {
  it("the chosen state is visible in both languages", () => {
    expect(hu.aiAssist.use).toBe("Ezt választom");
    expect(hu.aiAssist.selected).toBe("Kiválasztva ✓");
    expect(en.aiAssist.selected).toBe("Selected ✓");
  });

  it("the allowance line uses the real remaining number", () => {
    expect(makeI18n("hu").plural(hu.aiAssist.remaining, 4)).toBe("Ezen a héten még 4 személyre szabott kérdést kérhetsz Berripoptól.");
    expect(makeI18n("en").plural(en.aiAssist.remaining, 1)).toMatch(/1 more personal question this week/);
    expect(makeI18n("en").plural(en.aiAssist.remaining, 3)).toMatch(/3 more personal questions/);
  });
});
