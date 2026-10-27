/**
 * Contextual AI consent: runs an AI action only once consent is in place,
 * asking for it at the moment the member first uses an AI feature.
 *
 * The server stays authoritative: runMeteredAi refuses with
 * ai_consent_required before anything reaches the AI provider (and the AI
 * actions roll back their reservations on that refusal). The client view only
 * decides when to show the dialog, and is corrected by that refusal.
 */
export type AiConsentGate = {
  /** The client's current view: consent not required, or granted for the current notice. */
  allowed(): boolean;
  /** Shows the dialog; true only after the server has recorded the consent. */
  ask(): Promise<boolean>;
  /** The server refused: the client view was stale (withdrawn, outdated or never given). */
  invalidate(): void;
};

/**
 * Runs `call` at most once per consent given: never before consent is
 * recorded, and resumed automatically (no second click) right after it is.
 * Returns null when the member declines or consent could not be saved; the
 * AI request is then never sent.
 */
export async function runWithAiConsent<R>(gate: AiConsentGate, call: () => Promise<R>, refused: (r: R) => boolean): Promise<R | null> {
  if (!gate.allowed() && !(await gate.ask())) return null;
  const r = await call();
  if (!refused(r)) return r;
  // The client thought consent was in place but the server disagrees: ask once, then resume once.
  gate.invalidate();
  if (!(await gate.ask())) return null;
  return call();
}

/** Whether an action result is the server's consent refusal. */
export const consentRefused = (r: unknown): boolean =>
  !!r && typeof r === "object" && (r as { ok?: unknown }).ok === false && (r as { error?: unknown }).error === "ai_consent_required";
