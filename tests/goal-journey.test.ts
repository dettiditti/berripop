import { describe, expect, it } from "vitest";
import { journeyNodes } from "../lib/content";
import { personalFacts } from "../lib/domain/personal";
import { describeGoals, goalJourneyInstructions, goalNodes, goalQuestion, goalRef, goalsKey, isGoalRef, parseGoalJourney, parseGoalRef } from "../lib/journey/goal";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const raw = (days = 21) => JSON.stringify({
  weeks: [1, 2, 3].map(w => ({ theme: `Hét ${w}`, tagline: "Egy mondat." })),
  days: Array.from({ length: days }, (_, i) => ({ title: `Nap ${i + 1}`, prompt: `Kérdés ${i + 1}?`, theme: i % 2 ? "feel" : "nope", followups: ["Mélyebben?", "Még?", "Túl sok"] })),
});

describe("goal journey content", () => {
  it("keeps a complete journey, with kind and week from the built-in shape", () => {
    const j = parseGoalJourney(raw())!;
    expect(j.weeks).toHaveLength(3);
    expect(j.days).toHaveLength(goalNodes.length);
    expect(goalNodes).toHaveLength(21);
    expect(j.days.map(d => d.kind)).toEqual(goalNodes.map(n => n.kind));
    expect(j.days[6]).toMatchObject({ day: 7, week: 1, kind: "challenge" });
    expect(j.days[0].theme).toBe("grow"); // unknown theme falls back
    expect(j.days[1].theme).toBe("feel");
    expect(j.days[0].followups).toEqual(["Mélyebben?", "Még?"]);
  });
  it("rejects incomplete or malformed output", () => {
    expect(parseGoalJourney(raw(20))).toBeNull();
    expect(parseGoalJourney("not json")).toBeNull();
    expect(parseGoalJourney(JSON.stringify({ weeks: [{ theme: "a" }], days: [] }))).toBeNull();
    const missing = JSON.parse(raw());
    missing.days[4].prompt = "  ";
    expect(parseGoalJourney(JSON.stringify(missing))).toBeNull();
  });
  it("reads days nested per week, the format the AI is asked for", () => {
    const flat = JSON.parse(raw());
    const nested = (perWeek = [7, 7, 7]) => JSON.stringify({
      weeks: flat.weeks.map((w: object, i: number) => ({ ...w, days: flat.days.slice(i * 7, i * 7 + perWeek[i]).map((d: object, k: number) => ({ day: k + 1, ...d })) })),
    });
    const j = parseGoalJourney(nested())!;
    expect(j.days.map(d => d.title)).toEqual(flat.days.map((d: { title: string }) => d.title));
    expect(j.days[13]).toMatchObject({ day: 14, week: 2, kind: "challenge", title: "Nap 14" });
    // A week with a day missing is incomplete; an extra day is dropped.
    expect(parseGoalJourney(nested([7, 6, 7]))).toBeNull();
    const extra = JSON.parse(nested());
    extra.weeks[0].days.push({ day: 8, title: "Plusz", prompt: "Plusz?" });
    expect(parseGoalJourney(JSON.stringify(extra))!.days[7]).toMatchObject({ day: 8, title: "Nap 8" });
  });
  it("asks for 3 weeks of 7 days rather than one list of 21", () => {
    expect(goalJourneyInstructions("hu")).toMatch(/Each week has exactly 7 days/);
  });
  it("closes brackets the model left open at the very end, but not a cut-off answer", () => {
    const full = raw();
    expect(parseGoalJourney(full.slice(0, -2))).not.toBeNull(); // "]}" missing
    expect(parseGoalJourney(full.slice(0, -40))).toBeNull(); // stopped mid-day
    expect(parseGoalJourney(full.slice(0, full.lastIndexOf("{")) + "]}")).toBeNull(); // a day short
  });
  it("accepts JSON wrapped in prose or a code fence", () => {
    expect(parseGoalJourney("Here you go:\n```json\n" + raw() + "\n```")).not.toBeNull();
  });
});

describe("goal journey refs", () => {
  it("round-trips and rejects out-of-range days or other refs", () => {
    expect(parseGoalRef(goalRef(ID, 7))).toEqual({ journeyId: ID, day: 7 });
    expect(isGoalRef(goalRef(ID, 1))).toBe(true);
    expect(parseGoalRef(goalRef(ID, 0))).toBeNull();
    expect(parseGoalRef(goalRef(ID, 22))).toBeNull();
    expect(parseGoalRef("j01")).toBeNull();
    expect(parseGoalRef(`g:not-a-uuid:3`)).toBeNull();
  });
  it("a goal day becomes a question with its own text and follow-ups", () => {
    const day = parseGoalJourney(raw())!.days[6];
    const q = goalQuestion(ID, day);
    expect(q).toMatchObject({ id: goalRef(ID, 7), source: "goal", text: day.prompt, minutes: 10, prompts: day.followups });
  });
});

describe("goals key and prompt", () => {
  it("ignores order, case, spacing and duplicates", () => {
    expect(goalsKey(["  Futni ", "olvasni"])).toBe(goalsKey(["Olvasni", "futni", "futni"]));
    expect(goalsKey(["futni"])).not.toBe(goalsKey(["futni", "olvasni"]));
  });
  it("the prompt holds goals, area and time only", () => {
    const p = describeGoals({ goals: [{ title: "Futni", details: "egészség" }], area: "confidence", time: "5 minutes a day" });
    expect(p).toContain("- Futni (egészség)");
    expect(p).toContain("confidence");
    expect(p).toContain("5 minutes a day");
  });
});

describe("personal facts with a goal journey", () => {
  const none = { answeredRefs: [], journey: {}, xp: [], activityDates: [] };
  it("journey and week counts take the further of the two journeys", () => {
    const goalJourney = Object.fromEntries(journeyNodes.filter(n => n.week === 1).map(n => [n.day, "2026-10-01"]));
    const f = personalFacts({ ...none, journey: { 1: "2026-10-01" }, goalJourney });
    expect(f.journeyDone).toBe(7);
    expect(f.weeksDone).toBe(1);
  });
});
