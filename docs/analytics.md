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
| `journal_draft_started` | Server: a new journal draft was stored (once per entry) | – |
| `journal_draft_autosaved` | Editor: a draft autosaved (once per editor session) | – |
| `journal_final_save_clicked` / `journal_final_save_failed` | Editor: "save entry" pressed / the save failed (each once per editor session) | – |
| `journal_final_save_succeeded` | Server: an entry became saved (once per entry, only after the database stored it) | – |
| `journal_editor_closed_with_draft` | Editor closed with the text kept as an unfinished draft | – |
| `journal_ai_reflection_requested` | The member asked for an AI reflection on an entry | – |
| `journal_question_selected` | Berripop's AI follow-up question was chosen in the answer flow (once per question; choosing never asks the AI again) | `daily`, `journey` or `goal` |
| `thought_dissector_opened` | The Gondolatboncoló screen was opened | `thought` |
| `thought_dissector_started` | A session started: Berri's first reply arrived and one monthly session was used | `thought` |
| `thought_dissector_viewpoint_completed` | One viewpoint was finished (answered or skipped) | `thought` |
| `thought_dissector_message_sent` | The member sent an answer (never its text) | `thought` |
| `thought_dissector_completed` | The summary and thought map were made | `thought` |
| `thought_dissector_abandoned` | The member paused a session before the summary (it stays resumable) | `thought` |
| `thought_dissector_saved_to_journal` | The member saved the result into the journal | `thought` |
| `thought_dissector_quota_exhausted` | A start was refused because the monthly sessions were used up | `thought` |
| `thought_dissector_premium_clicked` | The Premium button in the Gondolatboncoló was pressed | `thought` |
| `pricing_viewed`, `upgrade_prompt_*`, `checkout_*`, `subscription_canceled`, `plan_changed`, `ai_allowance_reached`, `premium_feature_requested` | Subscription funnel | where it came from |

Server-side events are written only after the underlying record was newly
created (the same idempotent insert that grants XP), so retries never double count.

## Quick report

`npm run funnel` (or `npm run funnel -- 14` for members who joined in the last 14 days)
prints the funnel, a line per member and D1/D7/D30 retention. It counts real members
only: rows without a member (left by the deleted `verify:*` test users) and `test_` ids
are left out. It runs in a read-only transaction and prints no ids, names or content.

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
- Test users from `verify:*` scripts and their events are deleted at the end of
  each run. Events with a null `user_id` from earlier runs drop out of the queries above.
