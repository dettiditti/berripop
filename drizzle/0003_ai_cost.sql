-- AI cost logging: nullable provider token counts (null = not reported), cached tokens,
-- estimated cost (micro-USD, see lib/ai/prices.ts), outcome and attempts.
-- Additive and idempotent: existing rows keep their values; new columns are nullable or defaulted.
ALTER TABLE "ai_calls" ALTER COLUMN "input_tokens" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ai_calls" ALTER COLUMN "input_tokens" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_calls" ALTER COLUMN "output_tokens" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ai_calls" ALTER COLUMN "output_tokens" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "cache_read_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "cache_write_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "cost_micro_usd" integer;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "price_version" text;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "error_kind" text;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_calls_user_created_idx" ON "ai_calls" USING btree ("user_id","created_at");