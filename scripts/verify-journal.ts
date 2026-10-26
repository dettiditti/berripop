/**
 * Database checks for the daily journal: ownership, privacy, limits, AI
 * failure handling, editing, deletion and export. Temporary users; cleans up.
 *
 *   npm run verify:journal
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../lib/db";
import { circles, funnelEvents, growthInsights, journalReflections, users } from "../lib/db/schema";
import { PLAN_LIMITS } from "../lib/billing/plans";
import { consumeAiAllowance, getAiUsage } from "../lib/server/entitlements";
import * as journal from "../lib/server/journal";
import * as svc from "../lib/server/service";

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
}

const stamp = Date.now();
const A = `test_ja_${stamp}`, B = `test_jb_${stamp}`;
const SECRET = `journal-secret-${stamp}`;

async function main() {
  const db = getDb();
  await db.insert(users).values([{ id: A, displayName: "Anna" }, { id: B, displayName: "Bence" }]);
  let circleId = "";
  try {
    // A and B share a circle: journal must still stay private.
    const c = await svc.createCircle(A, "Journal test");
    circleId = c.ok ? c.snapshot.circle!.id : "";
    if (c.ok) await svc.joinCircle(B, c.snapshot.circle!.inviteCode);

    const draft = await journal.saveEntry(A, { body: "half a thought", status: "draft" });
    check("owner can save a draft", draft.ok && draft.state.entries[0]?.status === "draft");
    const entryId = draft.ok ? draft.data! : "";
    const saved = await journal.saveEntry(A, { id: entryId, body: `${SECRET} Today I asked for help at work.`, status: "saved" });
    check("owner can complete and edit the entry", saved.ok && saved.state.entries[0].status === "saved" && saved.state.entries[0].body.startsWith(SECRET));
    check("saving needs a few words", !(await journal.saveEntry(A, { body: "  ", status: "saved" })).ok);

    // Ownership: B can't touch A's journal
    check("another user sees none of the owner's entries", (await journal.loadJournal(B)).entries.length === 0);
    check("another user can't edit the entry", !(await journal.saveEntry(B, { id: entryId, body: "hijack", status: "saved" })).ok);
    check("another user can't delete the entry", !(await journal.deleteEntry(B, entryId)).ok);
    const bReflect = await journal.reflectOnEntry(B, entryId, "hu");
    check("another user can't request a reflection on it", !bReflect.ok && bReflect.error === "not_found");
    const bSnap = await svc.getSnapshot(B, circleId);
    check("circle members never receive journal text", bSnap.ok && !JSON.stringify(bSnap.snapshot).includes(SECRET));

    // A stored reflection (inserted directly so the test makes no paid AI call)
    const [refl] = await db.insert(journalReflections).values({
      entryId, userId: A, noticed: "You asked for help.", explore: "What made it easier?", suggestionKind: "exercise", suggestionText: "Ask once more this week.",
    }).returning({ id: journalReflections.id });
    check("a reflection suggestion is never saved as an insight automatically", (await journal.loadJournal(A)).insights.length === 0);
    check("another user can't leave feedback on it", !(await journal.reflectionFeedback(B, refl.id, "helpful")).ok);
    check("owner can correct the reflection", (await journal.reflectionFeedback(A, refl.id, "not_helpful", "It was actually my manager.")).ok);

    // Insights only on explicit save; owner-only edits
    const ins = await journal.saveInsight(A, { kind: "exercise", text: "Ask once more this week.", sourceEntryId: entryId, origin: "ai_suggested" });
    const insightId = ins.ok ? ins.state.insights[0].id : "";
    check("owner can save a confirmed insight", ins.ok && ins.state.insights[0].origin === "ai_suggested");
    check("another user can't edit the insight", !(await journal.updateInsight(B, insightId, "x y z")).ok);
    check("another user can't delete the insight", !(await journal.deleteInsight(B, insightId)).ok);
    check("insight links to another user's entry are dropped", (await journal.saveInsight(B, { kind: "theme", text: "Stolen link", sourceEntryId: entryId, origin: "user" })).ok
      && (await journal.loadJournal(B)).insights[0].sourceEntryId === null);

    // "What I want to remember": all four categories, validation, owner edit/delete
    for (const kind of ["question", "exercise", "quest"] as const) await journal.saveInsight(B, { kind, text: `Note ${kind}`, origin: "user" });
    const bState = await journal.loadJournal(B);
    check("all four categories can be saved", ["theme", "question", "exercise", "quest"].every(k => bState.insights.some(i => i.kind === k)));
    check("whitespace-only notes are rejected", !(await journal.saveInsight(B, { kind: "theme", text: "   \n ", origin: "user" })).ok);
    check("unknown categories are rejected", !(await journal.saveInsight(B, { kind: "secret", text: "Hello", origin: "user" })).ok);
    const bNote = bState.insights.find(i => i.kind === "quest")!;
    check("an edit to whitespace is rejected", !(await journal.updateInsight(B, bNote.id, "  ")).ok);
    const edited = await journal.updateInsight(B, bNote.id, "  Walk after lunch  ");
    check("owner can edit a note (trimmed)", edited.ok && edited.state.insights.some(i => i.id === bNote.id && i.text === "Walk after lunch"));
    check("owner can delete a note", (await journal.deleteInsight(B, bNote.id)).ok && !(await journal.loadJournal(B)).insights.some(i => i.id === bNote.id));
    check("Free plan doesn't offer saved notes as AI context", bState.insightContext === false);

    // Limits: separate journal allowance, enforced atomically
    const results = await Promise.all(Array.from({ length: PLAN_LIMITS.free.journalAiPerPeriod * 2 }, () => consumeAiAllowance(B, new Date(), "journal")));
    check(`exactly ${PLAN_LIMITS.free.journalAiPerPeriod} of ${results.length} parallel journal reflections are allowed`, results.filter(Boolean).length === PLAN_LIMITS.free.journalAiPerPeriod);
    check("the follow-up allowance is untouched", (await getAiUsage(B)).used === 0);
    check("the journal stays fully usable after the limit", (await journal.saveEntry(B, { body: "Still writing after the limit.", status: "saved" })).ok);

    // AI failures never cost an allowance
    const before = (await getAiUsage(A, new Date(), "journal")).used;
    const savedEnv = { oidc: process.env.VERCEL_OIDC_TOKEN, key: process.env.AI_GATEWAY_API_KEY, model: process.env.AI_GATEWAY_MODEL };
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.AI_GATEWAY_API_KEY;
    const off = await journal.reflectOnEntry(A, entryId, "hu");
    check("AI not configured → clear error, entry kept", !off.ok && off.error === "ai_unavailable");
    process.env.VERCEL_OIDC_TOKEN = savedEnv.oidc;
    if (savedEnv.key) process.env.AI_GATEWAY_API_KEY = savedEnv.key;
    process.env.AI_GATEWAY_MODEL = "nonexistent-provider/nonexistent-model";
    const broken = await journal.reflectOnEntry(A, entryId, "hu");
    check("failing AI call → clear error", !broken.ok && broken.error === "ai_unavailable");
    if (savedEnv.model) process.env.AI_GATEWAY_MODEL = savedEnv.model; else delete process.env.AI_GATEWAY_MODEL;
    check("failed AI calls don't use up the allowance", (await getAiUsage(A, new Date(), "journal")).used === before);

    // Premium-only weekly reflection
    const weekly = await journal.weeklyJournal(A, "hu");
    check("weekly journal reflection is Premium-only", !weekly.ok && weekly.error === "premium_required");

    // Analytics never carry journal text
    const events = await db.select().from(funnelEvents).where(eq(funnelEvents.userId, A));
    check("funnel events contain no journal text", !JSON.stringify(events).includes(SECRET));
    check("the first completed entry is tracked once (first exercise)", events.filter(e => e.event === "first_entry_saved").length === 1);

    // Export, delete, delete all
    const exported = await journal.exportJournal(A);
    check("export contains the owner's entries, reflections and insights", exported.entries.length === 1 && exported.reflections.length === 1 && exported.insights.length === 1);
    check("export never contains other users' data", !(await journal.exportJournal(B)).entries.some(e => e.body.includes(SECRET)));
    await journal.deleteEntry(A, entryId);
    const afterDelete = await journal.loadJournal(A);
    check("deleting an entry removes its reflections", afterDelete.entries.length === 0 && afterDelete.reflections.length === 0);
    check("an approved insight survives without its source link", afterDelete.insights.length === 1 && afterDelete.insights[0].sourceEntryId === null);
    await journal.deleteAllJournal(A);
    const leftover = await db.select().from(growthInsights).where(eq(growthInsights.userId, A));
    check("delete all removes every entry and insight", (await journal.loadJournal(A)).entries.length === 0 && leftover.length === 0);
  } finally {
    if (circleId) await db.delete(circles).where(eq(circles.id, circleId));
    await db.delete(users).where(inArray(users.id, [A, B]));
    console.log("cleaned up test data");
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
