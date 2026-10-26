CREATE TABLE "personal_daily_quests" (
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"question_ref" text NOT NULL,
	CONSTRAINT "personal_daily_quests_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_achievements_user_id_achievement_id_pk" PRIMARY KEY("user_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "user_activity" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"question_ref" text NOT NULL,
	"date" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_activity_user_id_kind_key_pk" PRIMARY KEY("user_id","kind","key")
);
--> statement-breakpoint
CREATE TABLE "user_xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"amount" integer NOT NULL,
	"ref" text NOT NULL,
	"theme" text,
	"date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_moments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text,
	"date" text NOT NULL,
	"words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"own_words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prompt_id" text,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answers" ALTER COLUMN "circle_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_daily_quests" ADD CONSTRAINT "personal_daily_quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_xp_events" ADD CONSTRAINT "user_xp_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_moments" ADD CONSTRAINT "world_moments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_xp_events_user_ref_idx" ON "user_xp_events" USING btree ("user_id","ref");--> statement-breakpoint
CREATE INDEX "user_xp_events_user_date_idx" ON "user_xp_events" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "world_moments_user_idx" ON "world_moments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "world_moments_user_client_idx" ON "world_moments" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "answers_user_personal_question_idx" ON "answers" USING btree ("user_id","question_ref") WHERE "answers"."circle_id" is null;--> statement-breakpoint
-- Backfill: progress earned in circles becomes the member's personal progress.
-- Circle data stays untouched; a reward earned in two circles counts once. Safe to re-run.
INSERT INTO "user_activity" ("user_id", "kind", "key", "question_ref", "date", "completed_at")
SELECT DISTINCT ON ("user_id", "kind", "key") "user_id", "kind", "key", "question_ref", "date", "completed_at"
FROM "participations" ORDER BY "user_id", "kind", "key", "completed_at"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "user_xp_events" ("user_id", "reason", "amount", "ref", "theme", "date", "created_at")
SELECT DISTINCT ON ("user_id", "r") "user_id", "reason", "amount", "r", "theme", to_char("created_at" AT TIME ZONE 'Europe/Budapest', 'YYYY-MM-DD'), "created_at"
FROM (SELECT *, substr("ref", length("user_id") + 4) AS "r" FROM "xp_events" WHERE "user_id" IS NOT NULL AND starts_with("ref", 'u:' || "user_id" || ':')) AS "x"
ORDER BY "user_id", "r", "created_at"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "user_achievements" ("user_id", "achievement_id", "unlocked_at")
SELECT "user_id", "achievement_id", min("unlocked_at") FROM "achievements" GROUP BY "user_id", "achievement_id"
ON CONFLICT DO NOTHING;
