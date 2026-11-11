import { describe, expect, it, vi } from "vitest";
import { removeListener } from "../lib/nativeBridge";

describe("native listener removal", () => {
  it("removes a listener given directly (as the iPhone app returns it) or as a promise, and never throws", async () => {
    const direct = { remove: vi.fn() };
    const later = { remove: vi.fn(async () => {}) };
    expect(() => removeListener(direct)).not.toThrow();
    expect(() => removeListener(Promise.resolve(later))).not.toThrow();
    expect(() => removeListener(undefined)).not.toThrow();
    expect(() => removeListener(Promise.reject(new Error("gone")))).not.toThrow();
    expect(() => removeListener({ remove: () => { throw new Error("boom"); } })).not.toThrow();
    await new Promise(r => setTimeout(r, 0));
    expect(direct.remove).toHaveBeenCalledTimes(1);
    expect(later.remove).toHaveBeenCalledTimes(1);
  });
});
