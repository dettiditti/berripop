import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../db/schema";
import { isNativeApp } from "../native";
import { track } from "./analytics";

/**
 * Creates our user row the first time a verified Clerk user shows up (web or
 * mobile). The display name is only looked up for a new row. `source` records
 * where the account was created; it is written once and never changed.
 */
export async function ensureUserRow(userId: string, displayName: () => Promise<string>, source: "web" | "appstore" = "web"): Promise<void> {
  const db = getDb();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (existing.length) return;
  const name = (await displayName()).slice(0, 40);
  const created = await db.insert(users).values({ id: userId, displayName: name, signupSource: source }).onConflictDoNothing().returning({ id: users.id });
  if (created.length) await track(userId, "signup_completed");
}

/** Returns the signed-in Clerk user id (creating our user row on first visit), or null. */
export async function requireUserId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  await ensureUserRow(userId, async () => {
    const u = await currentUser();
    return u?.firstName || u?.username || "";
  }, await signupSource());
  return userId;
}

/** "appstore" when the request comes from the Berripop iPhone app (its user agent), otherwise "web". */
async function signupSource(): Promise<"web" | "appstore"> {
  try {
    return isNativeApp((await headers()).get("user-agent")) ? "appstore" : "web";
  } catch {
    return "web";
  }
}
