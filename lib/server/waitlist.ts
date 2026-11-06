import { getDb } from "../db";
import { appWaitlist } from "../db/schema";
import type { WaitlistEntry } from "../waitlist";

/**
 * Saves a waitlist sign-up. Signing up again with the same address keeps one
 * row and refreshes its language and consent version. Never logs the address.
 */
export async function joinWaitlist(entry: WaitlistEntry): Promise<void> {
  await getDb()
    .insert(appWaitlist)
    .values(entry)
    .onConflictDoUpdate({ target: appWaitlist.email, set: { locale: entry.locale, consentVersion: entry.consentVersion, createdAt: new Date() } });
}
