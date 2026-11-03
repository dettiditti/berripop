/**
 * One-off backfill: encrypts private texts that were stored before content
 * encryption existed (lib/db/encryption.ts). Without --apply it only counts
 * the plaintext rows; with --apply it rewrites them in small batches, leaving
 * updated_at alone. Safe to re-run: encrypted rows are skipped. Prints counts
 * only, never content. Refuses a remote (production) database unless
 * ALLOW_PRODUCTION_DB=1 (scripts/db-guard.ts), and refuses without
 * CONTENT_ENCRYPTION_KEY. Take a backup (Neon branch) first.
 *
 *   ALLOW_PRODUCTION_DB=1 npm run encrypt:content            count only
 *   ALLOW_PRODUCTION_DB=1 npm run encrypt:content -- --apply encrypt
 */
import "./db-guard";
import { eq, inArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { getDb } from "../lib/db";
import { answers, dailyCheckins, growthInsights, journalEntries, journalReflections, worldMoments } from "../lib/db/schema";
import { contentEncryptionEnabled } from "../lib/db/encryption";

type Target = { name: string; table: PgTable; id: PgColumn; columns: Record<string, PgColumn>; json?: string[] };

const TARGETS: Target[] = [
  { name: "answers", table: answers, id: answers.id, columns: { text: answers.text, reflectionPrompt: answers.reflectionPrompt, reflection: answers.reflection } },
  { name: "journal_entries", table: journalEntries, id: journalEntries.id, columns: { body: journalEntries.body } },
  {
    name: "journal_reflections", table: journalReflections, id: journalReflections.id, json: ["alternatives"],
    columns: {
      noticed: journalReflections.noticed, strength: journalReflections.strength, explore: journalReflections.explore, nextStep: journalReflections.nextStep,
      alternatives: journalReflections.alternatives, suggestionText: journalReflections.suggestionText, correction: journalReflections.correction,
    },
  },
  { name: "growth_insights", table: growthInsights, id: growthInsights.id, columns: { text: growthInsights.text } },
  { name: "daily_checkins", table: dailyCheckins, id: dailyCheckins.id, json: ["aiReply"], columns: { note: dailyCheckins.note, aiReply: dailyCheckins.aiReply } },
  { name: "world_moments", table: worldMoments, id: worldMoments.id, json: ["ownWords"], columns: { note: worldMoments.note, ownWords: worldMoments.ownWords } },
];

const BATCH = 200;

/** A row still needs encrypting when any of its columns holds plaintext. */
function plaintextWhere(t: Target): SQL {
  const parts = Object.entries(t.columns).map(([key, col]) =>
    t.json?.includes(key)
      ? sql`(${col} is not null and jsonb_typeof(${col}) <> 'string')`
      : sql`(${col} is not null and ${col} <> '' and ${col} !~ '^enc:[0-9a-f]{8}:')`,
  );
  return sql.join(parts, sql` or `);
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (!contentEncryptionEnabled()) throw new Error("CONTENT_ENCRYPTION_KEY is not set");
  const db = getDb();
  for (const t of TARGETS) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.table).where(plaintextWhere(t));
    if (!apply) {
      console.log(`${t.name}: ${n} row(s) to encrypt`);
      continue;
    }
    let done = 0;
    for (;;) {
      // Read through the encrypted columns: legacy plaintext comes back as is, and is encrypted on write.
      const rows = (await db.select({ id: t.id, ...t.columns }).from(t.table).where(plaintextWhere(t)).limit(BATCH)) as ({ id: string } & Record<string, unknown>)[];
      if (rows.length === 0) break;
      for (const { id, ...values } of rows) await db.update(t.table).set(values).where(eq(t.id, id));
      done += rows.length;
      // Stop rather than loop if a batch did not change (e.g. an unexpected value).
      const [{ left }] = await db.select({ left: sql<number>`count(*)::int` }).from(t.table).where(sql`${inArray(t.id, rows.map(r => r.id))} and (${plaintextWhere(t)})`);
      if (left > 0) throw new Error(`${t.name}: ${left} row(s) could not be encrypted`);
    }
    console.log(`${t.name}: encrypted ${done} of ${n} row(s)`);
  }
  if (!apply) console.log("Count only. Re-run with --apply to encrypt.");
}

main().catch(err => {
  console.error(`Failed: ${(err as Error)?.message ?? err}`);
  process.exitCode = 1;
});
