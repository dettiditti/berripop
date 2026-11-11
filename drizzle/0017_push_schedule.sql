CREATE TABLE "push_sends" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"date" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_sends_user_id_kind_date_pk" PRIMARY KEY("user_id","kind","date")
);
--> statement-breakpoint
ALTER TABLE "push_devices" ADD COLUMN "time_zone" text DEFAULT 'Europe/Budapest' NOT NULL;--> statement-breakpoint
ALTER TABLE "push_devices" ADD COLUMN "remind" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Phones registered before this migration keep what they were offered: the evening reminder at 19:00, no morning thought.
ALTER TABLE "push_devices" ADD COLUMN "remind_hour" integer DEFAULT 19 NOT NULL;--> statement-breakpoint
ALTER TABLE "push_devices" ALTER COLUMN "remind_hour" SET DEFAULT 17;--> statement-breakpoint
ALTER TABLE "push_devices" ADD COLUMN "thought" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "push_devices" ALTER COLUMN "thought" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "push_devices" ADD COLUMN "thought_hour" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "push_devices" ADD COLUMN "personalize" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "push_sends" ADD CONSTRAINT "push_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;