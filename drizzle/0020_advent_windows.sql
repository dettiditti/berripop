CREATE TABLE "advent_windows" (
	"user_id" text NOT NULL,
	"year" integer NOT NULL,
	"day" integer NOT NULL,
	"gift" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advent_windows_user_id_year_day_pk" PRIMARY KEY("user_id","year","day")
);
--> statement-breakpoint
ALTER TABLE "advent_windows" ADD CONSTRAINT "advent_windows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;