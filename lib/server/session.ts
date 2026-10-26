import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../db/schema";
import { track } from "./analytics";

/** Returns the signed-in Clerk user id (creating our user row on first visit), or null. */
export async function requireUserId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const db = getDb();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!existing.length) {
    const u = await currentUser();
    const name = (u?.firstName || u?.username || "").slice(0, 40);
    const created = await db.insert(users).values({ id: userId, displayName: name }).onConflictDoNothing().returning({ id: users.id });
    if (created.length) await track(userId, "signup_completed");
  }
  return userId;
}
