import { describe, expect, it } from "vitest";
import { errorField } from "../lib/signupErrors";

const el = (className: string) => ({ className }) as unknown as Element;

describe("errorField", () => {
  it("names the form part from Clerk's class names only", () => {
    expect(errorField(el("cl-formFieldErrorText cl-formFieldErrorText__password"))).toBe("password");
    expect(errorField(el("cl-formFieldErrorText cl-formFieldErrorText__emailAddress"))).toBe("email");
    expect(errorField(el("cl-formFieldErrorText cl-formFieldErrorText__code"))).toBe("code");
    expect(errorField(el("cl-alert cl-internal-x"))).toBe("form");
    expect(errorField(el("cl-formFieldErrorText cl-formFieldErrorText__username"))).toBe("other");
  });
});
