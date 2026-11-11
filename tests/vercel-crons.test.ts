import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REMIND_HOURS, THOUGHT_HOURS } from "../lib/push/schedule";

const crons = (JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] }).crons;

describe("Vercel crons (Hobby plan: each at most once a day)", () => {
  it("every cron runs once a day, with its own path", () => {
    for (const c of crons) expect(c.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
    expect(new Set(crons.map(c => c.path)).size).toBe(crons.length);
    expect(crons.length).toBeLessThanOrEqual(100);
  });

  it("the notification job runs in every hour a Hungarian member can pick, summer and winter time", () => {
    const hours = new Set(crons.filter(c => c.path.startsWith("/api/cron/reminders")).map(c => Number(c.schedule.split(" ")[1])));
    for (const local of [...THOUGHT_HOURS, ...REMIND_HOURS]) {
      for (const offset of [1, 2]) expect(hours.has((local - offset + 24) % 24)).toBe(true);
    }
  });
});
