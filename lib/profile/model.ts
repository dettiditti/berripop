/**
 * The two optional facts a member can share about themselves (an age range and
 * a gender), so AI answers fit their stage of life and how they want to be
 * addressed. Pure (no I/O), so it is unit-tested directly.
 *
 * "under16" is never stored: the app is for 16 and over, so that answer stops
 * the start flow instead.
 */

export const AGE_RANGES = ["16_17", "18_24", "25_34", "35_44", "45_54", "55_plus"] as const;
export const GENDERS = ["woman", "man", "other", "unsaid"] as const;
/** What the start flow offers: the stored ranges plus the one that stops it. */
export const AGE_CHOICES = ["under16", ...AGE_RANGES] as const;

export type AgeRange = (typeof AGE_RANGES)[number];
export type Gender = (typeof GENDERS)[number];
export type AgeChoice = (typeof AGE_CHOICES)[number];
export type MemberProfile = { ageRange?: AgeRange; gender?: Gender };

const pick = <T extends string>(v: unknown, allowed: readonly T[]) =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

/** Keeps only known values; anything else (including "under16") is dropped. */
export function cleanProfile(raw: unknown): MemberProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: MemberProfile = {};
  const ageRange = pick(r.ageRange, AGE_RANGES);
  const gender = pick(r.gender, GENDERS);
  if (ageRange) out.ageRange = ageRange;
  if (gender) out.gender = gender;
  return out;
}

const AGE_EN: Record<AgeRange, string> = {
  "16_17": "16-17 years old", "18_24": "18-24 years old", "25_34": "25-34 years old",
  "35_44": "35-44 years old", "45_54": "45-54 years old", "55_plus": "55 or older",
};
const GENDER_EN: Record<Exclude<Gender, "unsaid">, string> = { woman: "a woman", man: "a man", other: "non-binary or another gender" };

/**
 * One sentence for the AI's instructions, or "" when nothing was shared. It
 * only shapes tone and examples: the model must not mention it, build
 * stereotypes on it, or guess anything beyond it.
 */
export function profileInstruction(p: MemberProfile): string {
  const parts = [p.gender && p.gender !== "unsaid" ? GENDER_EN[p.gender] : null, p.ageRange ? AGE_EN[p.ageRange] : null].filter(Boolean);
  if (!parts.length) return "";
  return `About the person (shared by them): ${parts.join(", ")}. Use this only to make your tone, wording and examples fit their stage of life; do not mention it, do not rely on stereotypes, and do not assume anything beyond it.`;
}
