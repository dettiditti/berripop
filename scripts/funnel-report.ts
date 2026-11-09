/**
 * Read-only funnel report on funnel_events (docs/analytics.md). Counts real
 * members only: rows left without a member (test users of the verify:*
 * scripts are deleted after each run) and test_ ids are left out. Runs in a
 * read-only transaction and prints counts and event names, never member ids,
 * names or content, so it needs no ALLOW_PRODUCTION_DB.
 *
 *   npm run funnel            all real members
 *   npm run funnel -- 14      only members who joined in the last 14 days
 */
import { neon } from "@neondatabase/serverless";

const TZ = "Europe/Budapest";
const STEPS = [
  "signup_completed", "path_chosen", "app_opened", "today_step_started", "daily_answered",
  "journey_day_completed", "first_goal_created", "first_entry_saved", "pricing_viewed", "checkout_started", "checkout_completed",
] as const;
/** Anonymous sign-up page steps (each once per browser tab), then real accounts created. */
const SIGNUP_STEPS = [
  "signup_page_viewed", "signup_form_started", "signup_social_clicked", "signup_submitted",
  "signup_error_shown", "signup_verify_viewed", "signup_completed",
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const days = Number(process.argv[2] ?? 0);
  if (!Number.isInteger(days) || days < 0) throw new Error("Usage: npm run funnel -- [days]");
  const sql = neon(url);

  // Real members (optionally recent ones), numbered by join order so they can be told apart without an id.
  const members = sql`select id, row_number() over (order by created_at) as n, created_at from users
    where id not like 'test\\_%' and (${days} = 0 or created_at >= now() - make_interval(days => ${days}))`;

  const [overview, funnel, journeys, retention, signup] = await sql.transaction([
    sql`with m as (${members}) select count(distinct m.id)::int as members, count(e.id)::int as events,
      min(m.created_at at time zone ${TZ})::date::text as first_joined, max(e.created_at at time zone ${TZ})::text as last_event
      from m left join funnel_events e on e.user_id = m.id`,
    sql`with m as (${members}) select s.step, count(distinct e.user_id)::int as members
      from unnest(${STEPS as unknown as string[]}::text[]) with ordinality s(step, ord)
      left join funnel_events e on e.event = s.step and e.user_id in (select id from m)
      group by s.step, s.ord order by s.ord`,
    sql`with m as (${members}) select m.n as member, (m.created_at at time zone ${TZ})::date::text as joined,
      count(distinct (e.created_at at time zone ${TZ})::date) filter (where e.event = 'app_opened')::int as days_opened,
      string_agg(distinct e.event, ', ') as reached
      from m left join funnel_events e on e.user_id = m.id group by m.n, m.created_at order by m.n`,
    sql`with m as (${members}), opens as (
        select user_id, (created_at at time zone ${TZ})::date as d from funnel_events where event = 'app_opened' and user_id in (select id from m)),
      cohort as (select user_id, min(d) as d0 from opens group by user_id)
      select count(*)::int as cohort,
        count(*) filter (where d0 <= current_date - 1)::int as d1_eligible,
        count(*) filter (where d0 <= current_date - 1 and exists (select 1 from opens o where o.user_id = c.user_id and o.d = c.d0 + 1))::int as d1,
        count(*) filter (where d0 <= current_date - 7)::int as d7_eligible,
        count(*) filter (where d0 <= current_date - 7 and exists (select 1 from opens o where o.user_id = c.user_id and o.d = c.d0 + 7))::int as d7,
        count(*) filter (where d0 <= current_date - 30)::int as d30_eligible,
        count(*) filter (where d0 <= current_date - 30 and exists (select 1 from opens o where o.user_id = c.user_id and o.d = c.d0 + 30))::int as d30
      from cohort c`,
    // Before sign-up there is no member, so these rows have no user id; signup_completed counts real members only.
    sql`select s.step, count(e.id)::int as tabs
      from unnest(${SIGNUP_STEPS as unknown as string[]}::text[]) with ordinality s(step, ord)
      left join funnel_events e on e.event = s.step
        and e.created_at >= now() - make_interval(days => ${days || 30})
        and (case when s.step = 'signup_completed' then e.user_id not like 'test\\_%' else e.user_id is null end)
      group by s.step, s.ord order by s.ord`,
  ], { readOnly: true });

  console.log(days ? `Members who joined in the last ${days} days` : "All real members");
  console.table(overview);
  console.log("Funnel: members who reached each step");
  console.table(funnel);
  console.log("Per member (numbered by join order)");
  console.table(journeys);
  console.log("Retention (app_opened on cohort day + N; only cohorts old enough count)");
  console.table(retention);
  console.log(`Sign-up page, last ${days || 30} days (browser tabs that reached each step; the last row is accounts created)`);
  console.table(signup);
}

main().catch(err => {
  console.error(`Failed: ${(err as Error)?.message ?? err}`);
  process.exitCode = 1;
});
