import { describe, expect, it } from "vitest";
import { crisisSignal, HELPLINES } from "../lib/safety/crisis";
import { parseReflection } from "../lib/journal/reflection";
import { dictionaries } from "../lib/i18n/dictionaries";

/*
 * The crisis safety route: a keyword signal (one of two, with the AI's flag),
 * verified help numbers, and copy that never promises to catch every crisis.
 */

describe("keyword signal", () => {
  it.each([
    "Néha arra gondolok, hogy öngyilkos leszek.",
    "Nem akarok már élni.",
    "meg akarok halni",
    "Tegnap megvágtam magam.",
    "nincs ertelme elni", // without accents
    "I want to die.",
    "I've been thinking about killing myself",
    "I don't want to be alive anymore",
    "self-harm again",
  ])("fires on %s", text => expect(crisisSignal(text)).toBe(true));

  it.each([
    "Fáradt vagyok, sok volt ma a munka.",
    "Meghalok a röhögéstől ezen a videón.", // a common figure of speech
    "Megvágtam az ujjam főzés közben.",
    "I'm dying to see the new film.",
    "",
  ])("stays quiet on %s", text => expect(crisisSignal(text)).toBe(false));

  it("is only a signal: indirect wording is missed, which is why the help link is always there", () => {
    expect(crisisSignal("Szerintem mindenkinek jobb lenne nélkülem.")).toBe(false);
  });
});

describe("help numbers and copy", () => {
  it("lists 112, 116-123 and 116-111, each with an official source", () => {
    expect(HELPLINES.map(h => h.number)).toEqual(["112", "116-123", "116-111"]);
    for (const h of HELPLINES) {
      expect(h.tel).toMatch(/^\d+$/);
      expect(h.source).toMatch(/^https:\/\//);
    }
  });

  for (const locale of ["hu", "en"] as const) {
    it(`${locale}: names every line and says the signal can miss things`, () => {
      const s = dictionaries[locale].safety;
      for (const h of HELPLINES) expect(s.helplines[h.id].name && s.helplines[h.id].detail).toBeTruthy();
      expect(s.limits).toMatch(locale === "hu" ? /nem ismer fel minden/ : /doesn't recognise every/);
      expect(s.limits).toMatch(locale === "hu" ? /nem krízisszolgálat/ : /not a crisis service/);
    });

    it(`${locale}: the reflection prompt asks for the safety flag and forbids phone numbers`, () => {
      const p = dictionaries[locale].journal.ai.reflectInstructions;
      expect(p).toContain('"safety": boolean');
      expect(p).toMatch(locale === "hu" ? /Telefonszámot soha ne írj/ : /Never give phone numbers/);
    });
  }
});

describe("AI flag", () => {
  it("is true only when the model says exactly true", () => {
    expect(parseReflection(JSON.stringify({ noticed: "a", explore: "b?", safety: true }), [])!.safety).toBe(true);
    expect(parseReflection(JSON.stringify({ noticed: "a", explore: "b?", safety: "yes" }), [])!.safety).toBe(false);
    expect(parseReflection(JSON.stringify({ noticed: "a", explore: "b?" }), [])!.safety).toBe(false);
  });
});
