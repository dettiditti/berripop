import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/db", () => ({ getDb: () => { throw new Error("no db in this test"); } }));

import { FUNNEL_EVENTS, isTrackContext } from "../lib/server/analytics";
import { APP_STORE_URL, appStoreLink } from "../lib/native";

describe("App Store links on the landing page", () => {
  it("counts a tap as an allowlisted event with the link as context", () => {
    expect(FUNNEL_EVENTS).toContain("app_store_clicked");
    expect(isTrackContext("landing_strip")).toBe(true);
    expect(isTrackContext("landing_phone")).toBe(true);
  });

  it("links to the Berripop app in the App Store", () => {
    expect(APP_STORE_URL).toBe("https://apps.apple.com/app/berripop/id6832949814");
    expect(appStoreLink("landing_strip")).toBe("https://apps.apple.com/app/berripop/id6832949814?pt=129769574&ct=landing_strip&mt=8");
    expect(appStoreLink("landing_phone")).toContain("ct=landing_phone");
  });
});
