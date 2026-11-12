import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { widgetTipDone, widgetTipDue, widgetTipLater } from "../lib/widgetTip";
import { en } from "../lib/i18n/dictionaries/en";
import { hu } from "../lib/i18n/dictionaries/hu";

describe("the 'Berri on your Home Screen' tip", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { window?: unknown }).window = {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    };
  });
  afterEach(() => { delete (globalThis as { window?: unknown }).window; });

  it("shows until the member says they will do it, then never again", () => {
    expect(widgetTipDue("u1", "2026-11-12")).toBe(true);
    widgetTipDone("u1");
    expect(widgetTipDue("u1", "2026-11-12")).toBe(false);
    expect(widgetTipDue("u1", "2027-01-01")).toBe(false);
    expect(widgetTipDue("u2", "2026-11-12")).toBe(true);
  });

  it("asks again three days after 'later'", () => {
    widgetTipLater("u1", "2026-11-12");
    expect(widgetTipDue("u1", "2026-11-14")).toBe(false);
    expect(widgetTipDue("u1", "2026-11-15")).toBe(true);
  });

  it("stays away when storage is blocked or broken", () => {
    store.set("berripop-widget-tip:u1", "{oops");
    expect(widgetTipDue("u1", "2026-11-12")).toBe(false);
    (globalThis as { window?: unknown }).window = { localStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => {} } };
    expect(widgetTipDue("u1", "2026-11-12")).toBe(false);
  });

  it("has three steps in both languages", () => {
    expect(hu.widgetTip.steps).toHaveLength(3);
    expect(en.widgetTip.steps).toHaveLength(3);
  });
});
