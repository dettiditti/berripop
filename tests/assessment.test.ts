import { describe, expect, it } from "vitest";
import {
  baseComplete, describeAnswers, MAX_AI_CALLS, MAX_FOLLOWUPS, parseFollowup, parsePlan, planInstructions, sanitizeAccepted, sanitizeAnswers, sanitizeFollowups, stepComplete,
} from "../lib/assessment/model";

describe("assessment answers", () => {
  it("keeps known fields and option keys only, trimmed and length-limited", () => {
    const a = sanitizeAnswers({ area: "stress", situation: "  " + "x".repeat(900), obstacles: ["time", "hack", "time"], support: "questions", evil: "<script>", time: "always" });
    expect(a.area).toBe("stress");
    expect(a.situation?.length).toBe(600);
    expect(a.obstacles).toEqual(["time"]);
    expect(a).not.toHaveProperty("support");
    expect(a).not.toHaveProperty("evil");
    expect(a).not.toHaveProperty("time");
    expect(sanitizeAnswers(null)).toEqual({});
  });
  it("knows when each step and the base questions are complete", () => {
    expect(stepComplete({ area: "other" }, "area")).toBe(false);
    expect(stepComplete({ area: "other", areaText: "zene" }, "area")).toBe(true);
    expect(stepComplete({ situation: "röviden" }, "situation")).toBe(false);
    const full = sanitizeAnswers({ area: "confidence", situation: "Megbeszéléseken hallgatok.", outcome: "Szólni merni", obstacles: ["fear"], time: "daily5", support: ["exercises"] });
    expect(baseComplete(full)).toBe(true);
    expect(baseComplete({ ...full, time: undefined })).toBe(false);
  });
  it("caps follow-ups and drops empty questions", () => {
    expect(sanitizeFollowups([{ question: "a?", answer: "b" }, { question: "", answer: "x" }, { question: "c?" }, { question: "d?" }])).toEqual([{ question: "a?", answer: "b" }, { question: "c?", answer: "" }]);
    expect(MAX_FOLLOWUPS).toBe(2);
    expect(MAX_AI_CALLS).toBe(4);
  });
  it("describes answers to the model with stable English labels and skips unanswered follow-ups", () => {
    const text = describeAnswers({ area: "confidence", obstacles: ["fear", "time"], time: "daily5", support: ["exercises"] }, [{ question: "Mikor nehéz?", answer: "Főnök előtt" }, { question: "Más?", answer: "" }]);
    expect(text).toContain("self-confidence and speaking up");
    expect(text).toContain("fear or self-doubt, little time");
    expect(text).toContain("Főnök előtt");
    expect(text).not.toContain("Más?");
  });
  it("tells the model not to diagnose and to answer in the user's language", () => {
    expect(planInstructions("hu")).toContain("Hungarian");
    expect(planInstructions("en")).toContain("English");
    expect(planInstructions("hu")).toMatch(/Never diagnose/);
  });
});

describe("parsing AI output", () => {
  it("parses one follow-up question, including fenced JSON", () => {
    expect(parseFollowup('```json\n{"question":"Mikor a legnehezebb megszólalni?"}\n```')).toBe("Mikor a legnehezebb megszólalni?");
    expect(parseFollowup("no json here")).toBeNull();
    expect(parseFollowup('{"question":"  "}')).toBeNull();
  });
  it("parses a valid plan and normalises limits", () => {
    const raw = JSON.stringify({
      summary: "Szeretnél bátrabban megszólalni a munkahelyi megbeszéléseken.",
      goals: [{ title: "Megszólalni a megbeszéléseken", why: "Hogy hallják a véleményed." }, { title: "Felkészülni előre" }, { title: "C" }, { title: "D" }],
      firstStep: { title: "Írj fel egy mondatot a holnapi megbeszélésre.", minutes: 300 },
      nextSteps: [{ title: "Egy kérdés a héten" }, { title: "Egy vélemény a héten" }, { title: "" }],
      weeklyRhythm: "Hétköznap reggel 5 perc.",
    });
    const plan = parsePlan(raw)!;
    expect(plan.goals).toHaveLength(3);
    expect(plan.goals[1].why).toBe("");
    expect(plan.firstStep.minutes).toBe(60);
    expect(plan.nextSteps).toHaveLength(2);
  });
  it("rejects incomplete plans (no goals, no first step or no next steps)", () => {
    expect(parsePlan(JSON.stringify({ summary: "x", goals: [], firstStep: { title: "a" }, nextSteps: [{ title: "b" }] }))).toBeNull();
    expect(parsePlan(JSON.stringify({ summary: "x", goals: [{ title: "g" }], nextSteps: [{ title: "b" }] }))).toBeNull();
    expect(parsePlan(JSON.stringify({ summary: "x", goals: [{ title: "g" }], firstStep: { title: "a" }, nextSteps: [] }))).toBeNull();
    expect(parsePlan("not json")).toBeNull();
  });
  it("validates the edited plan the member accepts", () => {
    expect(sanitizeAccepted({ goals: ["  Cél egy  ", "x", 5], firstStep: "Első lépés", nextSteps: ["Lépés kettő", ""] })).toEqual({ goals: ["Cél egy"], firstStep: "Első lépés", nextSteps: ["Lépés kettő"] });
    expect(sanitizeAccepted({ goals: [], firstStep: "Első" })).toBeNull();
    expect(sanitizeAccepted({ goals: ["Cél"], firstStep: "" })).toBeNull();
  });
});
