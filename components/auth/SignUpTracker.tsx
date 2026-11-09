"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { trackAction } from "@/lib/server/actions";

/*
 * Anonymous steps of the sign-up page, to see where visitors stop before an
 * account exists (docs/analytics.md, "Sign-up page"). Only the event name is
 * sent: never what was typed, no email, no id. Clerk renders the form, so the
 * steps are read from its DOM: the first focus in a field, a form submit, a tap
 * on a social button, Clerk's email-code route and its error texts.
 * Each step counts once per browser tab, so reloads and retries do not inflate it.
 */
type Step =
  | "signup_page_viewed" | "signup_form_started" | "signup_submitted"
  | "signup_social_clicked" | "signup_verify_viewed" | "signup_error_shown";

const STORE_KEY = "berripop.signupSteps";
const sent = new Set<string>();

function once(step: Step, context?: string) {
  const key = context ? `${step}:${context}` : step;
  if (sent.has(key)) return;
  sent.add(key);
  try {
    const seen: string[] = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "[]");
    if (seen.includes(key)) return;
    sessionStorage.setItem(STORE_KEY, JSON.stringify([...seen, key]));
  } catch {
    // Without storage the in-memory set still keeps it to once per page load.
  }
  void trackAction(step, context).catch(() => {});
}

function socialProvider(target: EventTarget | null): string | null {
  const button = target instanceof Element ? target.closest("[class*='cl-socialButtonsBlockButton'], [class*='cl-socialButtonsIconButton']") : null;
  if (!button) return null;
  const cls = button.className.toString();
  if (cls.includes("__apple")) return "apple";
  if (cls.includes("__google")) return "google";
  return "social";
}

export default function SignUpTracker({ inApp, children }: { inApp: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const context = inApp ? "app" : undefined;

  useEffect(() => { once("signup_page_viewed", context); }, [context]);

  // Clerk moves to /sign-up/verify-email-address (or …-phone-number) for the code step.
  useEffect(() => {
    if (pathname.includes("/verify-")) once("signup_verify_viewed", context);
  }, [pathname, context]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onFocus = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement) once("signup_form_started", context);
    };
    const onSubmit = () => once("signup_submitted", context);
    const onClick = (e: MouseEvent) => {
      const provider = socialProvider(e.target);
      if (provider) once("signup_social_clicked", provider);
    };
    const errorSelector = "[class*='cl-formFieldErrorText'], [class*='cl-alert']";
    const checkErrors = () => { if (root.querySelector(errorSelector)) once("signup_error_shown", context); };
    const observer = new MutationObserver(checkErrors);
    root.addEventListener("focusin", onFocus);
    root.addEventListener("submit", onSubmit, true);
    root.addEventListener("click", onClick, true);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      root.removeEventListener("focusin", onFocus);
      root.removeEventListener("submit", onSubmit, true);
      root.removeEventListener("click", onClick, true);
      observer.disconnect();
    };
  }, [context]);

  return <div ref={ref} style={{ display: "contents" }}>{children}</div>;
}
