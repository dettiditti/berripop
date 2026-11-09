import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../lib/db/schema";

/*
 * Account deletion removes the users row and relies on foreign keys for the
 * rest (lib/server/account.ts). These checks fail when a table that points at
 * a member is added or changed without deciding what deletion does to it,
 * and when the latest migration disagrees with the schema.
 */

/** Deleted with the member. */
const CASCADE = [
  "achievements.user_id", "ai_calls.user_id", "apple_subscriptions.user_id", "ai_usage.user_id", "quota_uses.user_id", "entitlement_grants.user_id", "answer_reactions.user_id", "answers.user_id",
  "circle_members.user_id", "circle_questions.added_by", "custom_questions.author_id", "daily_checkins.user_id",
  "goal_journeys.user_id", "growth_goals.user_id", "growth_insights.user_id", "growth_steps.user_id",
  "journal_entries.user_id", "journal_moods.user_id", "journal_reflections.user_id", "legal_records.user_id", "participations.user_id",
  "path_assessments.user_id", "personal_daily_quests.user_id", "push_devices.user_id", "saved_questions.user_id",
  "subscriptions.user_id", "thought_sessions.user_id", "user_achievements.user_id", "user_activity.user_id", "user_prefs.user_id",
  "user_xp_events.user_id", "world_moments.user_id", "xp_events.user_id",
];
/** Kept without the link: no content (funnel and circle events) or kept for accounting (invoices). */
const SET_NULL = ["circle_events.actor_id", "funnel_events.user_id", "invoices.user_id"];
/** No delete rule: purgeAccount hands the circle to another member or deletes it first. */
const HANDLED_IN_CODE = ["circles.created_by"];

const tables: PgTable[] = (Object.values(schema) as unknown[]).filter((v): v is PgTable => v instanceof PgTable);
const usersName = getTableConfig(schema.users).name;

function schemaUserRefs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of tables) {
    const cfg = getTableConfig(t);
    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference();
      if (getTableConfig(ref.foreignTable).name !== usersName) continue;
      for (const c of ref.columns) out[`${cfg.name}.${c.name}`] = fk.onDelete ?? "no action";
    }
  }
  return out;
}

describe("what account deletion does to every table pointing at a member", () => {
  const refs = schemaUserRefs();

  it("every reference to users is accounted for, and nothing in the lists is stale", () => {
    expect(Object.keys(refs).sort()).toEqual([...CASCADE, ...SET_NULL, ...HANDLED_IN_CODE].sort());
  });

  it("content is deleted with the member", () => {
    for (const r of CASCADE) expect([r, refs[r]]).toEqual([r, "cascade"]);
  });

  it("only event logs and invoices keep a row, without the link", () => {
    for (const r of SET_NULL) expect([r, refs[r]]).toEqual([r, "set null"]);
  });

  it("circles.created_by has no delete rule, so purgeAccount must clear it first", () => {
    for (const r of HANDLED_IN_CODE) expect([r, refs[r]]).toEqual([r, "no action"]);
    const purge = readFileSync(new URL("../lib/server/account.ts", import.meta.url), "utf8");
    expect(purge).toMatch(/circles\.createdBy/);
  });

  it("no column that names a member lacks a foreign key", () => {
    const memberish = /^(user_id|author_id|actor_id|added_by|created_by|owner_id|member_id)$/;
    const unlinked: string[] = [];
    for (const t of tables) {
      const cfg = getTableConfig(t);
      const linked = new Set(cfg.foreignKeys.flatMap(fk => fk.reference().columns.map(c => c.name)));
      for (const c of cfg.columns) if (memberish.test(c.name) && !linked.has(c.name)) unlinked.push(`${cfg.name}.${c.name}`);
    }
    expect(unlinked).toEqual([]);
  });
});

describe("the latest migration agrees with the schema", () => {
  it("has the same references to users with the same delete rules", () => {
    const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as { entries: { idx: number }[] };
    const last = Math.max(...journal.entries.map(e => e.idx));
    const snap = JSON.parse(readFileSync(new URL(`../drizzle/meta/${String(last).padStart(4, "0")}_snapshot.json`, import.meta.url), "utf8")) as {
      tables: Record<string, { name: string; foreignKeys?: Record<string, { tableTo: string; columnsFrom: string[]; onDelete?: string }> }>;
    };
    const migrated: Record<string, string> = {};
    for (const t of Object.values(snap.tables)) {
      for (const fk of Object.values(t.foreignKeys ?? {})) {
        if (fk.tableTo !== usersName) continue;
        for (const c of fk.columnsFrom) migrated[`${t.name}.${c}`] = fk.onDelete ?? "no action";
      }
    }
    expect(migrated).toEqual(schemaUserRefs());
  });
});
