# Berripop: grow together

A playful, mobile-first personal growth prototype (Next.js App Router + TypeScript). Friends, partners and small groups answer tiny daily questions, earn XP, and move through a shared 21-day journey.

## Run it

Requires Node.js 20.9+ and the linked Vercel project (Neon + Clerk are provisioned through the Vercel Marketplace).

```bash
npm install
vercel env pull .env.local --yes
ALLOW_PRODUCTION_DB=1 npm run db:migrate   # the only database is production; back it up first
npm run dev
```

Then open http://localhost:3000, sign up, and create a circle.

## Shared circles: architecture

- **Auth:** Clerk (`middleware.ts`, `/sign-in`, `/sign-up`). Clerk's screens use the app language through the `kozos-locale` cookie.
- **Database:** Neon Postgres via Drizzle. The schema is `lib/db/schema.ts`, and the migration is `drizzle/0000_init.sql`. Tables: users, circles, circle_members, custom_questions, circle_questions, saved_questions, answers, answer_reactions, daily_quests, participations, shared_journey_days, xp_events, achievements, circle_milestones, circle_events, user_prefs.
- **Server:** `lib/server/actions.ts` (server actions: authenticate, then delegate) → `lib/server/service.ts` (all circle logic) → `lib/server/snapshot.ts` (the privacy-filtered data a member may see).
- **Shared rules:** `lib/domain/rules.ts`, used by both server and client: daily quest pick, journey availability, individual vs. shared completion, XP, achievements and milestones. `lib/domain/view.ts` derives the display state from a snapshot.

### Rules

- **Privacy:** answers are private by default. Other members' answer text is only selected when the author shared it, and only for current members. Feed events and participation never contain answer text. Making an answer private again hides it immediately.
- **Daily circle quest:** one question per circle per day (Europe/Budapest calendar), stored in `daily_quests`. Each member completes it on their own; participation is a `participations` row.
- **Journey, individual completion:** a member saved an answer for that day (private is fine). One new stop per member per day; finished stops can be revisited.
- **Journey, shared completion:** recorded in `shared_journey_days` once every member of a circle with 2+ members has completed the day. It is never removed.
- **XP:** `xp_events` has a unique `(circle_id, ref)`, so no reward can be granted twice. Shared rewards (`user_id` null) go to the circle. Deleting an answer keeps its participation record, XP and badges.
- **Invites:** `/join/<code>`. The invitee signs in and taps Join. Owners can create a new link (the old one stops working) and remove members; members can leave.

### Verify

```bash
ALLOW_PRODUCTION_DB=1 npm run verify:shared   # 30 end-to-end checks against the database with temporary users
npm run lint && npm run typecheck && npm run build
```

The `verify:*` scripts and `db:migrate` refuse to run against a remote database (for
Berripop that is production) unless `ALLOW_PRODUCTION_DB=1` is set (`scripts/db-guard.ts`).
Test users and their analytics events are deleted at the end of each run.

### Remaining production blockers

- Clerk production instance is live. Deleting a user in the Clerk dashboard deletes their data via `POST /api/clerk/webhook` (event `user.deleted`; renewal of a paid subscription is turned off first). It needs a webhook endpoint in the Clerk dashboard and `CLERK_WEBHOOK_SIGNING_SECRET` in Vercel (Production); without it the route answers 503.
- Migrations are applied manually (`npm run db:migrate`); add them to the deploy pipeline.
- No rate limiting on server actions yet; no email or push notifications.
- Anyone with a valid invite code can join (no owner approval step).
- Inner World moments stay device-only by design. Answers from the earlier browser-only prototype are not migrated.

## Subscriptions (Free / Premium)

Free stays useful forever. Premium adds more room and more AI help. Payments use **Stripe**, provisioned as a **test-mode sandbox** through the Vercel Marketplace: no real money moves until a live Stripe account is connected.

### What each plan gets (`lib/billing/plans.ts`)

| | Free | Premium |
| --- | --- | --- |
| Active growth goals | 1 | 5 |
| AI follow-up questions / week | 5 | 60 |
| Own circles (joining is unlimited) | 1 | 5 |
| Weekly AI growth summary | – | ✓ |
| Price | 0 Ft | 2 990 Ft / month or 23 990 Ft / year |

Everything else (daily quest, 21-day shared journey, sharing, XP, badges, Inner World, viewing, editing and deleting your own data) is free. Premium never unlocks other people's private answers. The pricing page lists features that aren't built yet (adaptive journeys, AI exercises, Berripop cosmetics) under "Planned", never as included.

- **AI allowance:** resets every Monday 00:00 Europe/Budapest. Only an explicit "Ask Berripop" or summary request counts. Reserving an allowance is a single conditional upsert (`consumeAiAllowance`), so parallel requests can't exceed the limit; a failed AI call is refunded. Basic daily quests never use the allowance.
- **AI provider:** Vercel AI Gateway with `openai/gpt-5-mini` by default, called with minimal reasoning (override with `AI_GATEWAY_MODEL`). It is chosen because the team's free AI Gateway credit covers it; Claude and Gemini models need paid credit. The Gateway catalog marks it `no_training` for all providers. The member's draft is sent only when they ask, isn't stored, and only token counts are logged (`ai_calls`).

### Architecture

- **Entitlements:** `lib/server/entitlements.ts` is the single authority (`getUserEntitlements`, `canCreateGrowthGoal`, `canOwnAnotherCircle`, `canAccessWeeklySummary`, `consumeAiAllowance`). It reads only the `subscriptions` row, which is written only from Stripe API reads on the server. `lib/billing/entitlements.ts` maps Stripe status to a plan: `active`/`trialing` → Premium, `past_due` → Premium with a payment warning (Stripe is retrying), and `canceled`/`unpaid`/`incomplete`/`incomplete_expired`/`paused` → Free. Cancel at period end stays Premium until the period ends.
- **Checkout:** `startCheckoutAction` → Stripe Checkout (`mode: subscription`, price looked up by lookup key). `/billing/success` asks the server to retrieve the session from Stripe and checks it belongs to the signed-in user before syncing. The URL alone grants nothing. `/billing/canceled` confirms nothing was charged.
- **Webhooks:** `POST /api/stripe/webhook` verifies the signature, records the event id in `stripe_events` (idempotent; released on failure so Stripe retries), and re-reads the subscription from Stripe for `checkout.session.*`, `customer.subscription.*`, `invoice.paid` and `invoice.payment_failed`. A full refund (`charge.refunded`) or a lost dispute (`charge.dispute.closed`) of a subscription payment cancels that subscription right away; partial refunds change nothing. Events from the other Stripe mode (test vs live, by the secret key) are ignored. Users are matched by the stored Stripe customer id. Add the two `charge.*` events to the Stripe webhook endpoint.
- **Billing portal:** "Manage billing" in Profile opens Stripe's Customer Portal (cancel at period end, switch monthly/annual, payment method, invoices).
- **Funnel analytics:** `funnel_events` stores only an allowlisted event name plus plan, interval and context: never answers, goals or AI text. Events: pricing viewed, upgrade prompt shown/dismissed, checkout started/completed/canceled, subscription canceled, AI allowance reached, premium feature requested. Product events (app opened once a day, daily answered, journey day completed/finished, path chosen, circle created/joined, Today step started) and the retention method: `docs/analytics.md`.
- **Upgrade prompts:** inline only, at four moments (second goal, AI allowance reached, weekly summary, second owned circle). Dismissal is remembered per device, and nothing already created is ever locked.
- **Migration:** `drizzle/0001_billing.sql` (subscriptions, stripe_events, ai_usage, ai_calls, growth_goals, funnel_events).

### Setup and configuration

```bash
npm run stripe:setup     # creates/updates the Premium product, both HUF prices and the portal config (test keys only)
```

| Variable | Status |
| --- | --- |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Provisioned (test mode) |
| `APP_URL` | Optional. Where Stripe sends members back; defaults to Vercel's production domain in Production and the request host elsewhere |
| `STRIPE_WEBHOOK_SECRET` | Set in Production (test mode). Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`. |
| `AI_GATEWAY_MODEL` | Optional |
| AI Gateway auth | `VERCEL_OIDC_TOKEN` (from `vercel env pull`) or `AI_GATEWAY_API_KEY` |

### Tests

```bash
npm test                 # Vitest: plans, status transitions, allowance, webhook idempotency + signatures, hu/en copy
npm run verify:billing   # database: goal/circle limits, parallel AI allowance, Premium-only access, status changes, forged checkout
npm run verify:shared    # shared circle privacy and completion
```

No real payment credentials are used in tests (signature tests use fake secrets).

### Before charging real money

- Connect a live Stripe account (`vercel integration resource claim kozos-stripe`), run `stripe:setup` against live keys deliberately (`STRIPE_SETUP_ALLOW_LIVE=1`), and set the webhook secret.
- **Tax:** Hungarian VAT (27%) is not configured. Enabling Stripe Tax needs an active tax registration, otherwise it silently collects nothing. Decide whether the listed prices include VAT.
- Add Terms of Service, Privacy Policy and cancellation pages, then link them from `/pricing` (they don't exist yet).
- Also handle `charge.dispute.created`, `charge.refunded` and `radar.early_fraud_warning.created`, and add rate limiting to AI actions.

## Daily Journal (Napló)

A private journal in its own tab. There's no required daily entry and no streak.

- **Writing:** a distraction-free full-screen editor. Drafts autosave 1.5 s after typing stops, the save status is always visible, and optional prompts are available. History is grouped by date. You can open, edit and delete any entry.
- **AI reflection (only when you ask):** after saving, you choose "Ask Berripop to reflect" or "Keep it just for me". The reflection has four parts: what I noticed, a strength or a step (only if there is one), something to explore, and a possible next step. It's stored separately (`journal_reflections`) and can be rated or corrected. The AI instructions live in the dictionaries in both languages (`journal.ai.*`) and forbid diagnoses, personality labels and claims of certainty. A self-harm mention gets a gentle pointer to trusted people or emergency services.
- **Growth goals and insights:** a reflection may suggest one connection to an active goal (a theme, question, exercise or quest idea). Nothing is saved automatically: "Save to remember" asks for confirmation first. Insights (`growth_insights`) are separate from entries and can be edited or deleted.
- **"What I want to remember" (Amit szeretnék megjegyezni):** the owner picks one of four cards (a realisation, a question, something to try, a daily-quest idea), writes a note and saves it. Notes are private: they are never shown to circle members and are **never sent to the AI automatically**. On Premium, a reflection or the weekly review includes saved notes only when the owner ticks "Use my saved thoughts for this reflection" for that one request (off by default, reset after each request; enforced server-side via the `useInsights` argument).
- **Weekly journal reflection (Premium):** it is generated on request and not stored. It separates "What you wrote" from "Possibilities (AI, tentative)" and questions, and each proposed insight can be saved or dismissed.
- **Plans:** journal writing, history, editing, export and deletion are always free, including after reaching a limit or canceling Premium. AI reflections use their own weekly allowance (Free 3, Premium 40; `journalAiPerPeriod` in `lib/billing/plans.ts`), separate from AI follow-up questions, with the same Monday reset and the same race-safe reservation. Failed AI calls are refunded.

### Privacy and data

- Every journal query filters by the authenticated owner (`lib/server/journal.ts`). Journal data is loaded by its own action and is never part of circle data, so circle members can't receive it. Entries can't be shared with anyone; the share option was deliberately left out.
- AI requests contain only the one entry and the titles of your active goals, plus (Premium, only when you opt in for that request) up to 8 saved notes. Only token counts are logged (`ai_calls`). Analytics events never include journal text, and the content is never used for advertising.
- **Retention:** entries stay until you delete them. Deleting an entry removes its reflections immediately; an approved insight keeps its text but loses the link. "Delete all journal data" removes every entry, reflection and insight. "Download my journal" exports everything as JSON.
- **AI provider:** Vercel AI Gateway (see above). Review the provider's data-retention settings in the AI Gateway dashboard before production use.
- Migration: `drizzle/0002_journal.sql` (journal_entries, journal_reflections, growth_insights).

### Tests

```bash
npm test                 # includes reflection/weekly parsing, journal plan limits, hu/en journal copy
npm run verify:journal   # 28 database checks: ownership, circle privacy, confirmed-only insights, allowance, AI failure refunds, export/delete
```

**Not yet verified live:** an actual AI reflection through AI Gateway. The tests cover parsing, failure handling and refunds without spending AI credits.

## My Inner World (Belső világom)

The app is called **Berripop**, after its mascot. You reach My Inner World from the Home card, Profile, or the desktop sidebar.

- **A little world that grows** (`components/world/WorldScene.tsx`, `lib/world.ts`): one plant per answer (sprout → bud → flower), a new place per finished journey week (Hum Meadow, Mirror Pond, Drift Isles), one decoration per badge, and one glow per saved moment. Nothing can be bought or rolled for, and nothing is ever removed.
- **Moments:** pick feeling words from an unsorted cloud (no groups, scores or emotion colours), add your own words, optionally answer a companion's nudge, and write a note. Moments stay in this browser, are never shared, and earn no XP.
- **Themes explored:** bubbles sized by how many answers touch each quest theme (Discover, Feel, Connect, Recharge, Grow). No labels, no scores.
- **Companions** (`components/world/Companion.tsx`): **Nubi** (a fog puff, here from the start), **Zing** (a seed fluff, joins after 3 themes), **Kobi** (a mossy pebble, joins after journey week 1). They never read or summarise anyone's answers.
- **Berripop moods:** happy, excited, curious, thinking, proud, sleepy, encouraging and comforting, each with its own face and CSS body language (squash and stretch, anticipation, leaning, yawning). All motion stops under `prefers-reduced-motion`.

## Languages (Hungarian + English)

Hungarian (`hu`) is the default; English (`en`) is fully supported. Switch any time in **Profile → Nyelv / Language** (Magyar 🇭🇺 / English 🇬🇧).

- **Dictionaries:** `lib/i18n/dictionaries/en.ts` and `hu.ts`, grouped into namespaces (`common`, `navigation`, `home`, `questions`, `journey`, `circle`, `gamification`, `mascot`, `profile`, `settings`, `privacy`, `validation`, `categories`, `content`, `sample`). The English dictionary defines the `Dictionary` type and `hu` must match it, so a missing or extra key fails `tsc`.
- **Content by id:** the 21 journey questions, 12 Explore questions, their reflection prompts, week themes, levels, badges, milestones and Berripop's lines are all keyed by stable ids. Progress stores ids only, so switching language never touches XP, completed stops or answers. Questions people write themselves keep their original text.
- **API:** `useI18n()` (`lib/i18n/client.ts`) returns `d` (the typed dictionary), `t` (fills `{placeholders}`), `plural` (Intl.PluralRules), `num`, `date` and `relativeDay` (Intl formatting in `hu-HU` / `en-GB`). `makeI18n(locale)` and `getDictionary(locale)` are the non-hook versions for server code.
- **Persistence:** a signed-in member's language is saved on their profile (`user_prefs.locale`) and wins when their data loads. On the device it is also kept in `localStorage` plus a `kozos-locale` cookie (so Clerk's screens match). New users default to Hungarian.
- **Adding a language:** add its code to `lib/i18n/config.ts`, write a dictionary typed as `Dictionary`, and register it in `lib/i18n/dictionaries/index.ts`.

## What's in the prototype

- **Home:** greeting, level and XP, a gentle "spark" streak, the daily quest card, a journey preview, circle activity, the next badge and a bonus challenge.
- **Daily quest flow:** intro → write → optional reflection prompts → choose "Just me" or "Me + my circle" → celebration with XP, level progress, badges and confetti.
- **Explore:** bonus questions with filters, bookmarks, and writing your own questions.
- **Journey:** a winding 21-day map (Discover / Connect / Grow) with done, current, tomorrow and locked stops, weekly challenge chests and week milestones.
- **Circle:** members, invites, shared milestones, and shared answers. Private answers stay hidden until their author shares them.
- **Profile:** name, badges, answer history (share later), how XP works, and prototype tools.

### Progression rules (`lib/content.ts`, `lib/progress.ts`)

| Action | XP |
| --- | --- |
| Daily quest | +20 |
| Optional reflection | +5 |
| First answer in a new topic | +10 |
| First bonus question each day | +10 |
| Weekly challenge (days 7, 14, 21) | +50 |

Sharing never earns XP, and no badge rewards sharing or reading private answers. Missing days never removes XP or badges. A single missed day is a free **rest day** that keeps the streak going. Two in a row end it, and Berripop welcomes you back.

Badges: First Tiny Step, Curious Mind, Seven Little Wins, Good Listener, Growing Together (needs a circle), Journey Explorer, Full Bunch. Levels live in an array in `lib/content.ts` and continue past the last entry automatically.
