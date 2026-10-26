-- My Path: initial assessment (one per user) and path steps. Additive and idempotent; no existing data changes.
CREATE TABLE IF NOT EXISTS "growth_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"goal_id" uuid,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "path_assessments" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"followups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plan" jsonb,
	"ai_calls" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "growth_steps" ADD CONSTRAINT "growth_steps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "growth_steps" ADD CONSTRAINT "growth_steps_goal_id_growth_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."growth_goals"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "path_assessments" ADD CONSTRAINT "path_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "growth_steps_user_idx" ON "growth_steps" USING btree ("user_id","position");