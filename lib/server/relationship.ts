import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { relationshipRecords } from "../db/schema";
import { isLocale, type Locale } from "../i18n/config";
import * as core from "../relationship/core";
import type { RelationshipDeps, RelationshipStore, StoredRow } from "../relationship/core";
import type { RelationshipKind } from "../relationship/records";
import type { RelationshipResult, RelationshipState, TranslationRecordDTO, TriggerRecordDTO } from "../relationship/types";
import { aiConfigured, runMeteredAi } from "./ai";
import { getUserEntitlements } from "./entitlements";
import { quotaUsage } from "./quota";

/*
 * Kapcsolati világ on the real database and AI Gateway. The rules live in
 * lib/relationship/core.ts; this file only supplies storage and services.
 * Every query filters by the owner's id. Text is never logged or tracked.
 *
 * Off unless RELATIONSHIP_WORLD_ENABLED=1, so the code can ship before the
 * relationship_records migration (drizzle/0019) has been run.
 */

export const relationshipEnabled = () => process.env.RELATIONSHIP_WORLD_ENABLED === "1";

const R = relationshipRecords;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const own = (userId: string, id: string) => and(eq(R.id, id), eq(R.userId, userId));
const toRow = (r: typeof R.$inferSelect): StoredRow => ({ id: r.id, kind: r.kind, data: r.data, insight: r.insight ?? null, createdAt: r.createdAt });

const store: RelationshipStore = {
  async latest(userId, kind) {
    const [r] = await getDb().select().from(R).where(and(eq(R.userId, userId), eq(R.kind, kind))).orderBy(desc(R.createdAt)).limit(1);
    return r ? toRow(r) : null;
  },
  async list(userId, kind, limit) {
    const rows = await getDb().select().from(R).where(and(eq(R.userId, userId), eq(R.kind, kind))).orderBy(desc(R.createdAt)).limit(limit);
    return rows.map(toRow);
  },
  async get(userId, id) {
    if (!UUID.test(id)) return null;
    const [r] = await getDb().select().from(R).where(own(userId, id)).limit(1);
    return r ? toRow(r) : null;
  },
  async insert(userId, data, insight) {
    const [r] = await getDb().insert(R).values({ userId, kind: data.kind, data, insight }).returning();
    return toRow(r);
  },
  async setInsight(userId, id, insight) {
    await getDb().update(R).set({ insight, updatedAt: new Date() }).where(own(userId, id));
  },
  async remove(userId, id) {
    if (!UUID.test(id)) return false;
    return (await getDb().delete(R).where(own(userId, id)).returning({ id: R.id })).length > 0;
  },
  async removeAll(userId) {
    await getDb().delete(R).where(eq(R.userId, userId));
  },
};

const deps: RelationshipDeps = {
  enabled: relationshipEnabled,
  aiConfigured,
  store,
  access: async userId => {
    const ent = await getUserEntitlements(userId);
    return { premium: ent.tier !== "free", plan: ent.plan, tier: ent.tier };
  },
  quota: async userId => {
    const ent = await getUserEntitlements(userId);
    const u = await quotaUsage(userId, ent.tier, "relationship");
    return { used: u.used, limit: u.limit, remaining: u.remaining, window: u.window, resets: u.resets };
  },
  ai: (userId, ask) => runMeteredAi(userId, "relationship", ask),
};

const loc = (l: string): Locale => (isLocale(l) ? l : "hu");

export const loadRelationshipState = (userId: string): Promise<RelationshipState> => core.loadState(deps, userId);
export const saveLoveLanguage = (userId: string, input: { receive?: unknown; give?: unknown }) => core.saveLoveLanguage(deps, userId, input);
export const saveAttachment = (userId: string, input: { answers?: unknown }) => core.saveAttachment(deps, userId, input);
export const reflectOnResult = (userId: string, id: unknown, locale: string) => core.reflect(deps, userId, id, loc(locale));
export const analyzeTrigger = (userId: string, input: unknown, locale: string): Promise<RelationshipResult<TriggerRecordDTO>> => core.analyzeTrigger(deps, userId, input, loc(locale));
export const translateSentence = (userId: string, input: { original?: unknown; who?: unknown }, locale: string): Promise<RelationshipResult<TranslationRecordDTO>> => core.translate(deps, userId, input, loc(locale));
export const deleteRelationshipRecord = (userId: string, id: unknown) => core.deleteRecord(deps, userId, id);
export const deleteAllRelationship = (userId: string) => core.deleteAll(deps, userId);

/** For the account export: every record with its text (the owner's own data). Works with the feature off too, once the table exists. */
export async function exportRelationship(userId: string) {
  try {
    const rows = await getDb().select().from(R).where(eq(R.userId, userId)).orderBy(desc(R.createdAt));
    return rows.map(r => ({ kind: r.kind as RelationshipKind, data: r.data, insight: r.insight, createdAt: r.createdAt }));
  } catch (err) {
    // Before the migration has run the table does not exist (42P01): nothing to export.
    const e = err as { code?: unknown; cause?: { code?: unknown } };
    if (e?.code === "42P01" || e?.cause?.code === "42P01") return [];
    throw err;
  }
}
