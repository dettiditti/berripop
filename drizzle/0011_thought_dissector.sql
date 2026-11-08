CREATE TABLE "thought_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"journal_entry_id" uuid,
	"saved_entry_id" uuid,
	"start_key" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"problem" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"viewpoints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"done" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" jsonb,
	"map" jsonb,
	"plan" text NOT NULL,
	"ai_turns" integer DEFAULT 0 NOT NULL,
	"turn_limit" integer NOT NULL,
	"quota_period" text,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "thought_sessions" ADD CONSTRAINT "thought_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thought_sessions" ADD CONSTRAINT "thought_sessions_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thought_sessions" ADD CONSTRAINT "thought_sessions_saved_entry_id_journal_entries_id_fk" FOREIGN KEY ("saved_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "thought_sessions_start_key_idx" ON "thought_sessions" USING btree ("user_id","start_key");--> statement-breakpoint
CREATE INDEX "thought_sessions_user_idx" ON "thought_sessions" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "thought_sessions_entry_idx" ON "thought_sessions" USING btree ("journal_entry_id");