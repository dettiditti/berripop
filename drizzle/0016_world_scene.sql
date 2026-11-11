ALTER TABLE "user_prefs" ADD COLUMN "scene" text DEFAULT 'meadow' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD COLUMN "scene_picked" boolean DEFAULT false NOT NULL;