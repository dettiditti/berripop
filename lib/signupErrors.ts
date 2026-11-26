/** Sign-up page analytics (components/auth/SignUpTracker): which form part an error belongs to. */

/** The form part an error element belongs to, from Clerk's class names (e.g. cl-formFieldErrorText__password). */
export function errorField(el: Element): "password" | "email" | "code" | "form" | "other" {
  const cls = el.className.toString();
  if (/cl-alert/.test(cls)) return "form";
  if (/__password\b|__confirmPassword\b/.test(cls)) return "password";
  if (/__emailAddress\b|__identifier\b/.test(cls)) return "email";
  if (/__code\b/.test(cls)) return "code";
  return "other";
}
