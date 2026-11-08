CREATE TABLE "journal_moods" (
	"entry_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mood" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_moods" ADD CONSTRAINT "journal_moods_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_moods" ADD CONSTRAINT "journal_moods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_moods_user_idx" ON "journal_moods" USING btree ("user_id");