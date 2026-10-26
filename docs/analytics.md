# Analytics and retention

All product analytics live in one table, `funnel_events` (`lib/server/analytics.ts`).
A row holds only an **allowlisted event name**, an optional `plan`, `interval` and
`context` (also allowlisted), the member id and a timestamp. Answers, journal
entries, reflections, goals and AI text are never stored there. Deleting an account
sets `user_id` to null, so counts stay but the person is gone.

## Events

| Event | When | Context |
| --- | --- | --- |
| `app_opened` | App shell loads, **at most once per member per day** (Europe/Budapest) | – |
| `path_chosen` | First run: member starts on their own | `personal` |
| `circle_created` / `circle_joined` | A circle is created / a new member joins | `circle` |
| `assessment_started` / `assessment_plan_ready` / `path_accepted` / `assessment_skipped` | Assessment funnel | – / `assessment` |
| `goal_journey_built` / `goal_journey_rebuilt` | Goal journey generated | – |
| `daily_answered` | First answer to today's daily question (once per day) | `personal` or `circle` |
| `journey_day_completed` | A journey stop is completed for the first time | `journey` (built-in) or `goal` |
| `journey_finished` | A chapter is finished: day 21, 42 or 63 of the built-in journey, or day 21 of a goal journey | `journey` or `goal` |
| `today_step_started` | Member starts the step Today recommends | `daily`, `assessment`, `goal`, `journey`, `rest` |
| `weekly_recap_viewed` | Weekly recap opened | – |
| `first_entry_saved` / `first_reflection_received` | Journal activation | – |
| `pricing_viewed`, `upgrade_prompt_*`, `checkout_*`, `subscription_canceled`, `plan_changed`, `ai_allowance_reached`, `premium_feature_requested` | Subscription funnel | where it came from |

Server-side events are written only after the underlying record was newly
created (the same idempotent insert that grants XP), so retries never double count.

## Retention method

A member's **cohort day** is the date of their first `app_opened`. They are
**retained on day N** if they have an `app_opened` on cohort day + N.
Report D1, D7 and D30, and only for cohorts at least N days old.

```sql
with opens as (
  select user_id, (created_at at time zone 'Europe/Budapest')::date as d
  from funnel_events where event = 'app_opened' and user_id is not null
), cohort as (
  select user_id, min(d) as d0 from opens group by user_id
)
select c.d0 as cohort, count(*) as members,
  round(100.0 * count(*) filter (where exists (select 1 from opens o where o.user_id = c.user_id and o.d = c.d0 + 1)) / count(*), 1) as d1,
  round(100.0 * count(*) filter (where exists (select 1 from opens o where o.user_id = c.user_id and o.d = c.d0 + 7)) / count(*), 1) as d7,
  round(100.0 * count(*) filter (where exists (select 1 from opens o where o.user_id = c.user_id and o.d = c.d0 + 30)) / count(*), 1) as d30
from cohort c group by c.d0 order by c.d0;
```

**Activation** (the leading signal): share of new members with a `daily_answered`
or `journey_day_completed` on their cohort day.

```sql
select count(distinct c.user_id) filter (where exists (
         select 1 from funnel_events e where e.user_id = c.user_id
           and e.event in ('daily_answered', 'journey_day_completed')
           and (e.created_at at time zone 'Europe/Budapest')::date = c.d0)) * 100.0 / nullif(count(distinct c.user_id), 0) as activated_pct
from (select user_id, min((created_at at time zone 'Europe/Budapest')::date) d0
      from funnel_events where event = 'app_opened' and user_id is not null group by user_id) c;
```

Notes:
- Counting starts with this release; earlier members have no `app_opened` rows,
  so their cohort day is their first open after it.
- Test users from `verify:*` scripts are deleted at the end of each run (their
  events keep a null `user_id` and drop out of the queries above).
