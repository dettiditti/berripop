import { describe, expect, it } from "vitest";
import { parseReflection, parseSummary, parseTranslation, parseTriggerInsight, summaryPrompt } from "../lib/relationship/ai";
import { RELATIONSHIP_COPY } from "../lib/relationship/copy";
import * as core from "../lib/relationship/core";
import type { AiAsk, RelationshipDeps, StoredRow } from "../lib/relationship/core";
import {
  ATTACHMENT_ITEMS, attachmentDetail, dailyQuestionIndex, GIVE_PAIRS, GROWTH_QUESTION_COUNTS, growthWeeks, isoWeek, retestFrom, weekStart, weeklyQuestion, loveLanguageDetail, RECEIVE_PAIRS, scoreAttachment, scoreLoveLanguages, toPercents, triggerPatterns,
} from "../lib/relationship/scoring";
import { LOVE_LANGUAGES, type Likert, type PairChoice } from "../lib/relationship/types";
import { PLAN_QUOTAS } from "../lib/billing/plans";
import { readFileSync } from "node:fs";
import type { AiOutcome } from "../lib/ai/run";

const sum = (o: Record<string, number>) => Object.values(o).reduce((n, x) => n + x, 0);
const pairs = (c: PairChoice, n = 10) => Array<PairChoice>(n).fill(c);
const likert = (v: Likert) => Array<Likert>(ATTACHMENT_ITEMS.length).fill(v);

describe("love languages: scoring", () => {
  it("each question set offers every pair of languages exactly once (no language favoured)", () => {
    for (const set of [RECEIVE_PAIRS, GIVE_PAIRS]) {
      const keys = set.map(p => [...p].sort().join("+"));
      expect(new Set(keys).size).toBe(10);
      for (const l of LOVE_LANGUAGES) expect(set.filter(p => p.includes(l)).length).toBe(4);
    }
  });

  it("percents always add up to 100, also for an even split", () => {
    expect(sum(toPercents({ a: 1, b: 1, c: 1 }, ["a", "b", "c"]))).toBe(100);
    expect(sum(toPercents({ a: 0, b: 0 }, ["a", "b"]))).toBe(100);
    const r = scoreLoveLanguages(pairs("both"), pairs("both"));
    expect(r.receive).toEqual({ words: 20, time: 20, gifts: 20, acts: 20, touch: 20 });
    expect(sum(r.give)).toBe(100);
  });

  it("names the strongest receiving language, and two when they are close", () => {
    // Always the left option: words wins three of its four receiving pairs.
    const r = scoreLoveLanguages(pairs("a"), pairs("b"));
    expect(sum(r.receive)).toBe(100);
    expect(r.top[0]).toBe(Object.entries(r.receive).sort((x, y) => y[1] - x[1])[0][0]);
    const even = scoreLoveLanguages(pairs("both"), pairs("both"));
    expect(even.top).toHaveLength(2);
  });

  it("detail: points out giving–receiving gaps and the mismatch of giving most where one needs least", () => {
    // Receiving: time always wins; giving: acts always wins.
    const receive = RECEIVE_PAIRS.map(([a, b]) => (a === "time" ? "a" : b === "time" ? "b" : "both") as PairChoice);
    const give = GIVE_PAIRS.map(([a, b]) => (a === "touch" ? "a" : b === "touch" ? "b" : "both") as PairChoice);
    const r = scoreLoveLanguages(receive, give);
    expect(r.top).toEqual(["time"]);
    expect(r.topGive).toBe("touch");
    const d = loveLanguageDetail(r);
    expect(d.gaps.map(g => g.lang)).toContain("time");
    expect(d.order[0]).toBe("time");
  });
});

describe("attachment: tendencies, never a single label", () => {
  it("middle answers: everything near 50, no main pattern, flagged as borderline", () => {
    const r = scoreAttachment(likert(3));
    expect(r.anxiety).toBe(50);
    expect(r.avoidance).toBe(50);
    expect(r.main).toBeNull();
    expect(r.borderline).toBe(true);
    expect(sum(r.leaning)).toBe(100);
  });

  it("calm, open answers lean secure; worried, close-seeking answers lean anxious", () => {
    const secure = ATTACHMENT_ITEMS.map(it => (it.reverse ? 5 : 1) as Likert);
    expect(scoreAttachment(secure)).toMatchObject({ anxiety: 0, avoidance: 0, main: "secure", borderline: false });
    const anxious = ATTACHMENT_ITEMS.map(it => (it.axis === "anxiety" ? (it.reverse ? 1 : 5) : it.reverse ? 5 : 1) as Likert);
    const a = scoreAttachment(anxious);
    expect(a.main).toBe("anxious");
    expect(a.anxiety).toBe(100);
    expect(a.avoidance).toBe(0);
  });

  it("each area has three statements, each axis nine; detail names the two most tender and steadiest areas", () => {
    expect(ATTACHMENT_ITEMS.filter(i => i.axis === "anxiety")).toHaveLength(9);
    for (const area of new Set(ATTACHMENT_ITEMS.map(i => i.area))) expect(ATTACHMENT_ITEMS.filter(i => i.area === area)).toHaveLength(3);
    const d = attachmentDetail(likert(3));
    expect(d.tender).toHaveLength(2);
    expect(d.steady).toHaveLength(2);
  });
});

describe("daily question and recurring patterns", () => {
  it("the same question all day, a different one the next day, always in range", () => {
    const n = RELATIONSHIP_COPY.hu.daily.questions.length;
    expect(dailyQuestionIndex("2026-11-12", n)).toBe(dailyQuestionIndex("2026-11-12", n));
    expect(dailyQuestionIndex("2026-11-12", n)).not.toBe(dailyQuestionIndex("2026-11-13", n));
    for (let d = 1; d <= 28; d++) {
      const i = dailyQuestionIndex(`2027-02-${String(d).padStart(2, "0")}`, n);
      expect(i >= 0 && i < n).toBe(true);
    }
  });

  it("counts only what the member marked, and only things seen at least twice", () => {
    const p = triggerPatterns([
      { feelings: ["hurt", "lonely"], reactions: ["withdraw"], needs: ["closeness"] },
      { feelings: ["hurt"], reactions: ["withdraw", "attack"], needs: ["closeness"] },
      { feelings: ["angry"], reactions: ["attack"], needs: [] },
    ]);
    expect(p.entries).toBe(3);
    expect(p.feelings).toEqual([{ id: "hurt", count: 2 }]);
    expect(p.reactions).toEqual([{ id: "withdraw", count: 2 }, { id: "attack", count: 2 }]);
    expect(p.needs).toEqual([{ id: "closeness", count: 2 }]);
  });
});

describe("copy matches the question structure in both languages", () => {
  it("same number of pairs, statements, scale steps and daily questions", () => {
    for (const c of Object.values(RELATIONSHIP_COPY)) {
      expect(c.love.receive).toHaveLength(RECEIVE_PAIRS.length);
      expect(c.love.give).toHaveLength(GIVE_PAIRS.length);
      expect(c.attach.items).toHaveLength(ATTACHMENT_ITEMS.length);
      expect(c.attach.scale).toHaveLength(5);
      expect(c.daily.questions).toHaveLength(30);
      expect(c.trigger.steps).toHaveLength(5);
    }
  });
});

describe("AI responses are parsed strictly", () => {
  it("reflection: needs every list; rejects broken or oversized JSON", () => {
    const ok = JSON.stringify({ summary: "Szép.", strengths: ["a"], tender: ["b"], tryThis: ["c"], safety: false });
    expect(parseReflection(ok)?.value.summary).toBe("Szép.");
    expect(parseReflection("```json\n" + ok + "\n```")).not.toBeNull();
    expect(parseReflection("not json")).toBeNull();
    expect(parseReflection(JSON.stringify({ summary: "x", strengths: [], tender: ["b"], tryThis: ["c"] }))).toBeNull();
    expect(parseReflection(JSON.stringify({ summary: "x".repeat(700), strengths: ["a"], tender: ["b"], tryThis: ["c"] }))).toBeNull();
  });

  it("trigger insight: only known needs, at most two; the safety flag is kept", () => {
    const r = parseTriggerInsight(JSON.stringify({ needs: ["closeness", "made_up", "respect", "safety"], reflection: "r", alternative: "a", safety: true }));
    expect(r?.value.needs).toEqual(["closeness", "respect"]);
    expect(r?.safety).toBe(true);
    expect(parseTriggerInsight(JSON.stringify({ needs: ["made_up"], reflection: "r", alternative: "a" }))).toBeNull();
  });

  it("translation: every field required", () => {
    expect(parseTranslation(JSON.stringify({ feeling: "f", need: "n", calm: "c", direct: "d", why: "w" }))?.value.calm).toBe("c");
    expect(parseTranslation(JSON.stringify({ feeling: "f", need: "n", calm: "c", direct: "d" }))).toBeNull();
  });
});

/* ---------- The server rules, in memory ---------- */

function setup(opts: { premium?: boolean; freeLeft?: number; enabled?: boolean; aiText?: string } = {}) {
  const rows: (StoredRow & { userId: string })[] = [];
  let n = 0;
  let remaining = opts.freeLeft ?? (opts.premium ? 25 : 1);
  const aiCalls: AiAsk<unknown>[] = [];
  const clock = { now: new Date(Date.UTC(2026, 10, 12, 10)) };
  const deps: RelationshipDeps = {
    now: () => clock.now,
    enabled: () => opts.enabled ?? true,
    aiConfigured: () => true,
    access: async () => ({ premium: !!opts.premium, plan: opts.premium ? "premium" : "free", tier: opts.premium ? "premium" : "free" }),
    quota: async () => ({ used: 0, limit: 1, remaining, window: opts.premium ? "week" : "once", resets: null }),
    ai: async <T,>(_userId: string, ask: AiAsk<T>): Promise<AiOutcome<T>> => {
      aiCalls.push(ask as AiAsk<unknown>);
      if (remaining <= 0) return { ok: false, error: "limit_ai", reason: "limit" };
      const v = ask.parse(opts.aiText ?? "");
      if (!v) return { ok: false, error: "ai_unavailable", reason: "parse_failed" };
      remaining -= 1;
      return { ok: true, value: v };
    },
    store: {
      latest: async (u, kind) => [...rows].reverse().find(r => r.userId === u && r.kind === kind) ?? null,
      list: async (u, kind, limit) => [...rows].reverse().filter(r => r.userId === u && r.kind === kind).slice(0, limit),
      get: async (u, id) => rows.find(r => r.userId === u && r.id === id) ?? null,
      insert: async (u, data, insight) => {
        const row = { userId: u, id: `id-${++n}`, kind: data.kind, data, insight, createdAt: new Date(clock.now.getTime() + n * 1000) };
        rows.push(row);
        return row;
      },
      setInsight: async (u, id, insight) => { const r = rows.find(x => x.userId === u && x.id === id); if (r) r.insight = insight; },
      remove: async (u, id) => { const i = rows.findIndex(r => r.userId === u && r.id === id); if (i < 0) return false; rows.splice(i, 1); return true; },
      removeAll: async u => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].userId === u) rows.splice(i, 1); },
    },
  };
  return { deps, rows, aiCalls, clock, later: (days: number) => { clock.now = new Date(clock.now.getTime() + days * 86_400_000); } };
}

const REFLECTION = JSON.stringify({ summary: "Úgy tűnik…", strengths: ["a"], tender: ["b"], tryThis: ["c"], safety: false });
const TRANSLATION = JSON.stringify({ feeling: "hiány", need: "közelség", calm: "Hiányzol.", direct: "Szeretnék több időt veled.", why: "Én-üzenet." });
const love = { receive: pairs("a"), give: pairs("b") };

describe("Kapcsolati világ rules (server side)", () => {
  it("everyone can take the tests; the detailed analysis is only sent to Premium", async () => {
    const free = setup();
    const r = await core.saveLoveLanguage(free.deps, "u1", love);
    expect(r.ok && r.state.loveLanguage?.result.top.length).toBeTruthy();
    expect(r.ok && r.state.loveLanguage?.detail).toBeNull();
    const a = await core.saveAttachment(free.deps, "u1", { answers: likert(2) });
    expect(a.ok && a.state.attachment?.detail).toBeNull();

    const paid = setup({ premium: true });
    const p = await core.saveAttachment(paid.deps, "u1", { answers: likert(2) });
    expect(p.ok && p.state.attachment?.detail?.tender).toHaveLength(2);
  });

  it("refuses incomplete or invalid answers, and does nothing while switched off", async () => {
    const { deps } = setup();
    expect(await core.saveLoveLanguage(deps, "u1", { receive: pairs("a", 9), give: pairs("a") })).toEqual({ ok: false, error: "invalid" });
    expect(await core.saveAttachment(deps, "u1", { answers: [...likert(3).slice(1), 6] })).toEqual({ ok: false, error: "invalid" });
    const off = setup({ enabled: false });
    expect(await core.saveLoveLanguage(off.deps, "u1", love)).toEqual({ ok: false, error: "disabled" });
    expect((await core.loadState(off.deps, "u1")).enabled).toBe(false);
  });

  it("the AI reflection is Premium: Free is refused before any AI call; asked again, the saved one returns free of charge", async () => {
    const free = setup({ aiText: REFLECTION });
    const saved = await core.saveLoveLanguage(free.deps, "u1", love);
    const id = saved.ok ? saved.data.id : "";
    expect(await core.reflect(free.deps, "u1", id, "hu")).toEqual({ ok: false, error: "premium_required" });
    expect(free.aiCalls).toHaveLength(0);

    const paid = setup({ premium: true, aiText: REFLECTION });
    const s = await core.saveLoveLanguage(paid.deps, "u1", love);
    const pid = s.ok ? s.data.id : "";
    const first = await core.reflect(paid.deps, "u1", pid, "hu");
    expect(first.ok && first.state.loveLanguage?.reflection?.summary).toBe("Úgy tűnik…");
    await core.reflect(paid.deps, "u1", pid, "hu");
    expect(paid.aiCalls).toHaveLength(1);
    // Only scores go to the AI, never the raw answers.
    expect(paid.aiCalls[0].prompt).toContain("Receiving (percent)");
  });

  it("another member's record can't be read, reflected on or deleted", async () => {
    const paid = setup({ premium: true, aiText: REFLECTION });
    const s = await core.saveLoveLanguage(paid.deps, "owner", love);
    const id = s.ok ? s.data.id : "";
    expect(await core.reflect(paid.deps, "intruder", id, "hu")).toEqual({ ok: false, error: "not_found" });
    expect(await core.deleteRecord(paid.deps, "intruder", id)).toEqual({ ok: false, error: "not_found" });
    expect((await core.loadState(paid.deps, "intruder")).loveLanguage).toBeNull();
  });

  it("the trigger map is Premium; a crisis text never reaches the AI", async () => {
    const entry = { situation: "Lemondta az estét.", feelings: ["hurt", "nope"], thought: "Nem vagyok fontos.", reactions: ["withdraw"], reactionNote: "" };
    const free = setup();
    expect(await core.analyzeTrigger(free.deps, "u1", entry, "hu")).toEqual({ ok: false, error: "premium_required" });

    const paid = setup({ premium: true, aiText: JSON.stringify({ needs: ["closeness"], reflection: "r", alternative: "a" }) });
    const r = await core.analyzeTrigger(paid.deps, "u1", entry, "hu");
    expect(r.ok && r.data.input.feelings).toEqual(["hurt"]);
    expect(r.ok && r.data.insight?.needs).toEqual(["closeness"]);

    const before = paid.aiCalls.length;
    expect(await core.analyzeTrigger(paid.deps, "u1", { ...entry, thought: "Nem akarok már élni." }, "hu")).toEqual({ ok: false, error: "safety" });
    expect(paid.aiCalls.length).toBe(before);
  });

  it("the translator: one free try on Free, then Premium; Premium uses its weekly allowance", async () => {
    const free = setup({ aiText: TRANSLATION });
    const first = await core.translate(free.deps, "u1", { original: "Neked soha nincs rám időd!", who: "partner" }, "hu");
    expect(first.ok && first.data.result.calm).toBe("Hiányzol.");
    expect(first.ok && first.state.freeTranslationLeft).toBe(false);
    expect(await core.translate(free.deps, "u1", { original: "Már megint elfelejtetted!", who: null }, "hu")).toEqual({ ok: false, error: "premium_required" });

    const paid = setup({ premium: true, freeLeft: 0, aiText: TRANSLATION });
    expect(await core.translate(paid.deps, "u1", { original: "Hagyj békén!", who: "friend" }, "hu")).toEqual({ ok: false, error: "limit_ai" });
  });

  it("the member can delete everything at once", async () => {
    const paid = setup({ premium: true, aiText: TRANSLATION });
    await core.saveLoveLanguage(paid.deps, "u1", love);
    await core.translate(paid.deps, "u1", { original: "Hagyj békén!", who: null }, "hu");
    await core.saveLoveLanguage(paid.deps, "u2", love);
    const r = await core.deleteAll(paid.deps, "u1");
    expect(r.ok && r.state.loveLanguage).toBeNull();
    expect(r.ok && r.state.translations).toEqual([]);
    expect(paid.rows.map(x => x.userId)).toEqual(["u2"]);
  });
});

describe("configuration", () => {
  it("Free gets one AI try; paid plans a finite weekly allowance that grows with the plan", () => {
    expect(PLAN_QUOTAS.free.relationship).toEqual([{ window: "once", limit: 1, name: "first" }]);
    expect(PLAN_QUOTAS.premium.relationship[0].window).toBe("week");
    expect(PLAN_QUOTAS.premium_plus.relationship[0].limit).toBeGreaterThan(PLAN_QUOTAS.premium.relationship[0].limit);
  });

  it("the conversion events exist, carrying only a name and a context", () => {
    for (const e of ["relationship_module_opened", "love_language_test_started", "love_language_test_completed", "attachment_test_started", "attachment_test_completed",
      "premium_feature_previewed", "premium_paywall_viewed", "premium_checkout_started", "premium_subscription_completed"]) {
      // lib/server/analytics.ts is server-only, so its allowlist is read as text here.
      expect(readFileSync("lib/server/analytics.ts", "utf8")).toContain(`"${e}",`);
    }
  });
});

const SUMMARY = JSON.stringify({ summary: "Ezen a héten…", noticed: ["a csend nehéz"], progress: "Többször szóltál.", nextStep: "Írd le előbb magadnak.", safety: false });
const TRIGGER = JSON.stringify({ needs: ["closeness"], reflection: "Érthető.", alternative: "Kérdezz rá nyugodtan.", safety: false });
const entry = { situation: "Nem válaszolt egész nap.", feelings: ["hurt"], thought: "Nem fontos neki", reactions: ["withdraw"], reactionNote: "" };

describe("growth path: weeks, questions, retests", () => {
  it("ISO weeks and Mondays are computed in UTC", () => {
    expect(isoWeek(new Date(Date.UTC(2026, 10, 12)))).toBe("2026-W46");
    expect(isoWeek(new Date(Date.UTC(2027, 0, 1)))).toBe("2026-W53");
    expect(isoWeek(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-W01");
    expect(weekStart(new Date(Date.UTC(2026, 10, 15, 23)))).toBe("2026-11-09");
  });

  it("a test can be taken again 30 days after the last one", () => {
    const last = new Date(Date.UTC(2026, 10, 1));
    expect(retestFrom(null, last)).toBeNull();
    expect(retestFrom(last, new Date(Date.UTC(2026, 10, 20)))).toBe("2026-12-01");
    expect(retestFrom(last, new Date(Date.UTC(2026, 11, 1)))).toBeNull();
  });

  it("the weekly question follows the results and exists in both languages", () => {
    for (const locale of ["hu", "en"] as const) {
      const q = RELATIONSHIP_COPY[locale].growth.questions;
      for (const [tag, n] of Object.entries(GROWTH_QUESTION_COUNTS)) expect(q[tag as keyof typeof q]).toHaveLength(n);
    }
    const a = weeklyQuestion("2026-W46", "time", "anxious");
    const b = weeklyQuestion("2026-W47", "time", "anxious");
    expect(new Set([a.tag, b.tag])).toEqual(new Set(["time", "anxious"]));
    expect(weeklyQuestion("2026-W46", null, null).tag).toBe("general");
    expect(weeklyQuestion("2026-W46", "time", "anxious")).toEqual(a);
  });

  it("weeks count the member's own entries, oldest first", () => {
    const now = new Date(Date.UTC(2026, 10, 12));
    const w = growthWeeks(now, [
      { at: new Date(Date.UTC(2026, 10, 10)), feelings: ["hurt"], needs: ["closeness"] },
      { at: new Date(Date.UTC(2026, 10, 11)), feelings: ["hurt", "angry"], needs: [] },
      { at: new Date(Date.UTC(2026, 10, 3)), feelings: ["lonely"], needs: [] },
    ], [{ at: new Date(Date.UTC(2026, 9, 20)) }]);
    expect(w.map(x => x.start)).toEqual(["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(w.map(x => x.triggers)).toEqual([0, 0, 1, 2]);
    expect(w[0].translations).toBe(1);
    expect(w[3].topFeeling).toBe("hurt");
    expect(w[3].topNeed).toBe("closeness");
  });

  it("the summary is parsed strictly, and its prompt carries labels only", () => {
    expect(parseSummary(SUMMARY)?.value.noticed).toEqual(["a csend nehéz"]);
    expect(parseSummary(JSON.stringify({ summary: "x" }))).toBeNull();
    expect(parseSummary("nem json")).toBeNull();
    const prompt = summaryPrompt({ entries: 2, translations: 1, feelings: ["Hurt ×2"], reactions: [], needs: [], previousEntries: 0 }, { love: null, attachment: null });
    expect(prompt).toContain("Hurt ×2");
  });
});

describe("growth path rules (server side)", () => {
  it("a test can only be taken again after a month; both results are kept for comparison", async () => {
    const t = setup({ premium: true });
    expect((await core.saveLoveLanguage(t.deps, "u1", love)).ok).toBe(true);
    const again = await core.saveLoveLanguage(t.deps, "u1", { receive: pairs("b"), give: pairs("a") });
    expect(again.ok ? null : again.error).toBe("too_soon");
    const s = await core.loadState(t.deps, "u1");
    expect(s.retest.love).toBe("2026-12-12");
    expect(s.retest.attachment).toBeNull();
    t.later(31);
    const later = await core.saveLoveLanguage(t.deps, "u1", { receive: pairs("b"), give: pairs("a") });
    expect(later.ok && later.state.growth?.previousLove?.result.top).toEqual(s.loveLanguage?.result.top);
    expect(later.ok && later.state.retest.love).not.toBeNull();
  });

  it("the growth path is Premium: Free gets no growth data and the summary needs Premium", async () => {
    const free = setup();
    expect((await core.loadState(free.deps, "u1")).growth).toBeNull();
    const r = await core.summarize(free.deps, "u1", "hu");
    expect(r.ok ? null : r.error).toBe("premium_required");
    expect(free.aiCalls).toHaveLength(0);
  });

  it("the summary needs something from the last seven days", async () => {
    const t = setup({ premium: true, aiText: SUMMARY });
    const r = await core.summarize(t.deps, "u1", "hu");
    expect(r.ok ? null : r.error).toBe("nothing_yet");
    expect(t.aiCalls).toHaveLength(0);
    expect((await core.loadState(t.deps, "u1")).growth?.hasActivity).toBe(false);
  });

  it("one summary a week, on request: asked again it costs nothing; it never sends what the member wrote", async () => {
    const t = setup({ premium: true, aiText: TRIGGER });
    expect((await core.analyzeTrigger(t.deps, "u1", entry, "hu")).ok).toBe(true);
    const before = await core.loadState(t.deps, "u1");
    expect(before.growth?.hasActivity).toBe(true);
    expect(before.growth?.doneThisWeek).toBe(false);

    const sum = setup({ premium: true, aiText: SUMMARY });
    sum.rows.push(...t.rows);
    const first = await core.summarize(sum.deps, "u1", "hu");
    expect(first.ok && first.data.week).toBe("2026-W46");
    expect(first.ok && first.state.growth?.doneThisWeek).toBe(true);
    expect(sum.aiCalls).toHaveLength(1);
    const ask = sum.aiCalls[0];
    expect(ask.prompt).toContain("Hurt ×1");
    expect(ask.prompt).not.toContain(entry.situation);
    expect(ask.prompt).not.toContain(entry.thought);

    const second = await core.summarize(sum.deps, "u1", "hu");
    expect(second.ok && second.data.id).toBe(first.ok && first.data.id);
    expect(sum.aiCalls).toHaveLength(1);

    sum.later(8);
    const next = await core.summarize(sum.deps, "u1", "hu");
    expect(next.ok ? null : next.error).toBe("nothing_yet");
  });
});
