import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { circleMembers } from "../db/schema";

/** The member's role in a circle, or null if they're not a member. Every circle operation checks this. */
export async function roleIn(userId: string, circleId: string): Promise<"owner" | "member" | null> {
  const rows = await getDb()
    .select({ role: circleMembers.role })
    .from(circleMembers)
    .where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.userId, userId)))
    .limit(1);
  return rows[0]?.role ?? null;
}
