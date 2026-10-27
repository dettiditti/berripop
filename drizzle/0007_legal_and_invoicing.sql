CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_key" text NOT NULL,
	"kind" text NOT NULL,
	"user_id" text,
	"stripe_customer_id" text,
	"stripe_invoice_id" text,
	"stripe_subscription_id" text,
	"stripe_payment_intent_id" text,
	"stripe_reversal_id" text,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"vat_key" text,
	"original_invoice_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"provider_external_id" text NOT NULL,
	"provider_invoice_number" text,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"granted" boolean NOT NULL,
	"context" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_records" ADD CONSTRAINT "legal_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_operation_key_idx" ON "invoices" USING btree ("operation_key");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_external_id_idx" ON "invoices" USING btree ("provider_external_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "invoices_stripe_invoice_idx" ON "invoices" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_user_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "legal_records_user_kind_idx" ON "legal_records" USING btree ("user_id","kind","created_at");