CREATE TABLE "app_waitlist" (
	"email" text PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	"consent_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
