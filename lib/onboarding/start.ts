import { areasOf, sanitizeAnswers, type AssessmentAnswers } from "../assessment/model";
import { cleanProfile, type MemberProfile } from "../profile/model";

/**
 * The phone app's first steps before an account exists: a name, an age range
 * and a gender (both optional facts for the AI's tone), and the four tap-only
 * questions of the My Path assessment (area, obstacles, time, support). Kept only in this browser until the member signs up, then moved
 * into their account and deleted here. Never any free text, never analytics.
 */
export type StartAnswers = Pick<AssessmentAnswers, "area" | "areas" | "obstacles" | "time" | "support">;
export type StartData = { name: string; profile: MemberProfile; answers: StartAnswers };

const KEY = "berripop.start.v1";
const MAX_NAME = 40;
/** Answers older than this are dropped rather than carried into a new account. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Keeps only the tap answers (no free text), the known profile values and a trimmed name. */
export function cleanStart(raw: unknown): StartData | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, MAX_NAME) : "";
  const profile = cleanProfile(r.profile);
  const a = sanitizeAnswers(r.answers);
  const answers: StartAnswers = {};
  if (a.area) answers.area = a.area;
  if (a.areas?.length) answers.areas = a.areas;
  if (a.obstacles?.length) answers.obstacles = a.obstacles;
  if (a.time) answers.time = a.time;
  if (a.support?.length) answers.support = a.support;
  if (!name && !Object.keys(profile).length && !Object.keys(answers).length) return null;
  return { name, profile, answers };
}

/**
 * Where the assessment continues after sign-up: the first free-text question
 * ("situation", step 1), or the area question again when "something else" was
 * among the picks, since that one needs a few words the app did not ask for yet.
 */
export function resumeStep(answers: StartAnswers): number {
  const list = areasOf(answers);
  return !list.length || list.includes("other") ? 0 : 1;
}

export function readStart(now = Date.now()): StartData | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: unknown };
    if (typeof parsed.at !== "number" || now - parsed.at > MAX_AGE_MS) {
      clearStart();
      return null;
    }
    return cleanStart(parsed);
  } catch {
    return null;
  }
}

export function saveStart(data: StartData, now = Date.now()): void {
  try {
    const clean = cleanStart(data);
    if (clean) window.localStorage.setItem(KEY, JSON.stringify({ ...clean, at: now }));
  } catch {
    // Private mode or blocked storage: the flow still works, the answers are simply asked again.
  }
}

export function clearStart(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
