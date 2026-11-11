import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../db/schema";
import { cleanProfile, profileInstruction, type MemberProfile } from "../profile/model";

/** The member's optional age range and gender; empty when not shared (or on any read error). */
export async function getMemberProfile(userId: string): Promise<MemberProfile> {
  try {
    const [row] = await getDb().select({ ageRange: users.ageRange, gender: users.gender }).from(users).where(eq(users.id, userId)).limit(1);
    return cleanProfile(row ?? {});
  } catch {
    // The profile only adjusts tone: AI keeps working without it.
    return {};
  }
}

/**
 * Saves what the member shared. A field left out stays as it is; null clears
 * it, so both can be removed again in Settings.
 */
export async function setMemberProfile(userId: string, patch: { ageRange?: unknown; gender?: unknown }): Promise<MemberProfile> {
  const clean = cleanProfile(patch);
  const set: { ageRange?: MemberProfile["ageRange"] | null; gender?: MemberProfile["gender"] | null } = {};
  if ("ageRange" in patch) set.ageRange = patch.ageRange === null ? null : clean.ageRange;
  if ("gender" in patch) set.gender = patch.gender === null ? null : clean.gender;
  // Unknown values are ignored rather than clearing what was saved.
  if (set.ageRange === undefined) delete set.ageRange;
  if (set.gender === undefined) delete set.gender;
  if (Object.keys(set).length) await getDb().update(users).set(set).where(eq(users.id, userId));
  return getMemberProfile(userId);
}

/** The instruction sentence for the AI, or "" when the member shared nothing. */
export async function profileInstructionFor(userId: string): Promise<string> {
  return profileInstruction(await getMemberProfile(userId));
}
