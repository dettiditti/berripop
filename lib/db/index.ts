import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Run `vercel env pull .env.local`.");
  return drizzle(neon(url), { schema });
}

let db: ReturnType<typeof createDb> | null = null;

/** Lazily created so `next build` works without database env vars. */
export function getDb() {
  if (!db) db = createDb();
  return db;
}
