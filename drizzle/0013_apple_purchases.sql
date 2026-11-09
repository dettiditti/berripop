CREATE TABLE "apple_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apple_subscriptions" (
	"original_transaction_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"interval" text,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"environment" text NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signup_source" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "apple_subscriptions" ADD CONSTRAINT "apple_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apple_subscriptions_user_idx" ON "apple_subscriptions" USING btree ("user_id");