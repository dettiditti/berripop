import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  budapestClock, daysBetween, emailDue, reminderEmail, unsubscribeToken, unsubscribeUrl, validUnsubscribeToken,
} from "../lib/email/reminder";

const SECRET = "test-secret";

describe("budapestClock", () => {
  it("gives the local date and hour in Budapest, across midnight and DST", () => {
    expect(budapestClock(new Date("2026-11-25T17:30:00Z"))).toEqual({ date: "2026-11-25", hour: 18 });
    expect(budapestClock(new Date("2026-11-25T23:30:00Z"))).toEqual({ date: "2026-11-26", hour: 0 });
    expect(budapestClock(new Date("2026-07-01T16:10:00Z"))).toEqual({ date: "2026-07-01", hour: 18 });
  });
});

describe("emailDue", () => {
  const today = "2026-11-25";
  const since = (n: number) => { let d = today; for (let i = 0; i < n; i++) d = new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10); return d; };

  it("counts days", () => {
    expect(daysBetween("2026-11-20", today)).toBe(5);
    expect(daysBetween(today, today)).toBe(0);
  });

  it("never on a day the member was already here", () => {
    expect(emailDue(today, today)).toBe(false);
  });

  it("the first three days away, then weekly up to four weeks, then stops", () => {
    const due = Array.from({ length: 40 }, (_, i) => i).filter(n => emailDue(since(n), today));
    expect(due).toEqual([1, 2, 3, 7, 14, 21, 28]);
  });
});

describe("reminderEmail", () => {
  const opts = { appUrl: "https://www.berripop.com/app", unsubscribeUrl: "https://www.berripop.com/email/unsubscribe?u=u1&t=x" };

  it("names only the journey day number, in the member's language", () => {
    const hu = reminderEmail("hu", { ...opts, journeyDay: 4 });
    expect(hu.text).toContain("4. napja");
    expect(hu.html).toContain(opts.appUrl);
    const en = reminderEmail("en", { ...opts, journeyDay: null });
    expect(en.subject).toMatch(/Berri/);
    expect(en.text).toContain("new question");
  });

  it("always carries the unsubscribe link, escaped in HTML", () => {
    const e = reminderEmail("hu", { ...opts, journeyDay: null });
    expect(e.text).toContain(opts.unsubscribeUrl);
    expect(e.html).toContain("u=u1&amp;t=x");
  });
});

describe("unsubscribe links", () => {
  it("only the member's own signature is accepted", () => {
    const t = unsubscribeToken("user_1", SECRET);
    expect(validUnsubscribeToken("user_1", t, SECRET)).toBe(true);
    expect(validUnsubscribeToken("user_2", t, SECRET)).toBe(false);
    expect(validUnsubscribeToken("user_1", t, "other")).toBe(false);
    expect(validUnsubscribeToken("user_1", "short", SECRET)).toBe(false);
  });

  it("points at the confirm page by default and the one-click endpoint for the header", () => {
    expect(unsubscribeUrl("https://www.berripop.com", "user_1", SECRET)).toMatch(/^https:\/\/www\.berripop\.com\/email\/unsubscribe\?u=user_1&t=/);
    expect(unsubscribeUrl("https://www.berripop.com", "user_1", SECRET, "/api/email/unsubscribe")).toMatch(/\/api\/email\/unsubscribe\?/);
  });
});

describe("privacy of the email job", () => {
  const src = readFileSync("lib/server/emailReminders.ts", "utf8");
  it("never reads written content", () => {
    for (const table of ["journalEntries", "answers", "dailyCheckins", "worldMoments", "growthGoals", "thoughtSessions"]) {
      expect(src).not.toMatch(new RegExp(`\\b${table}\\b`));
    }
    // From goal journeys only the id and owner: never the days, weeks or goals.
    expect(src).not.toMatch(/goalJourneys\.(days|weeks|goals)/);
  });

  it("nobody is signed up without their own yes: only the latest record counts, and it starts unasked", () => {
    expect(src).toContain('return !latest ? "unasked" : latest.granted ? "on" : "off"');
    expect(src).toMatch(/distinct on \(user_id\)[\s\S]*where granted/);
  });
});
