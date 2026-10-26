CREATE TABLE "goal_journeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"goals" jsonb NOT NULL,
	"weeks" jsonb NOT NULL,
	"days" jsonb NOT NULL,
	"locale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "goal_journeys" ADD CONSTRAINT "goal_journeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "goal_journeys_active_idx" ON "goal_journeys" USING btree ("user_id") WHERE "goal_journeys"."archived_at" is null;