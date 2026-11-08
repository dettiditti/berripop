/*
 * When an inline Premium offer may appear. Display only: prices, checkout and
 * entitlements are untouched.
 *
 * - At a real limit (AI allowance used up, goal or circle limit reached) the
 *   offer explains why something stopped, so it always shows.
 * - Otherwise it is an invitation, and those wait until the member has been
 *   active on a few different days, and then appear at most one per visit.
 */

/** Plain offers (not at a limit) wait until the member was active on this many different days. */
export const OFFER_AFTER_ACTIVE_DAYS = 3;

export function offerAllowed(o: { kind: string; atLimit: boolean; activeDays: number; claimedThisVisit: string | null }): boolean {
  if (o.atLimit) return true;
  if (o.activeDays < OFFER_AFTER_ACTIVE_DAYS) return false;
  return o.claimedThisVisit === null || o.claimedThisVisit === o.kind;
}

/** sessionStorage keys: which plain offer this visit (browser tab) already showed, and which kinds were already counted. */
export const OFFER_CLAIM_KEY = "berripop-offer-visit";
export const OFFER_TRACKED_KEY = "berripop-offer-counted";
