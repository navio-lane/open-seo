CREATE TABLE "seo_seeds" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
	"seed" text NOT NULL,
	"normalized_seed" text NOT NULL,
	"location_code" integer DEFAULT 2826 NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"created_at" text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
	"keyword" text NOT NULL,
	"normalized_keyword" text NOT NULL,
	"location_code" integer DEFAULT 2826 NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"created_at" text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_keyword_sources" (
	"keyword_id" text NOT NULL REFERENCES "seo_keywords"("id") ON DELETE cascade,
	"seed_id" text NOT NULL REFERENCES "seo_seeds"("id") ON DELETE cascade,
	"created_at" text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_serp_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"keyword_id" text NOT NULL REFERENCES "seo_keywords"("id") ON DELETE cascade,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"device" text DEFAULT 'desktop' NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"provider_task_id" text,
	"captured_at" text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_organic_results" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL REFERENCES "seo_serp_snapshots"("id") ON DELETE cascade,
	"rank" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "seo_match_presets" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"title_ignored_words" text DEFAULT '[]' NOT NULL,
	"url_ignored_words" text DEFAULT '["a","an","the","and"]' NOT NULL,
	"preserve_order" boolean DEFAULT false NOT NULL,
	"adjacent_phrase" boolean DEFAULT false NOT NULL,
	"url_path_only" boolean DEFAULT true NOT NULL,
	"ampersand_equals_and" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_opportunity_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL REFERENCES "seo_serp_snapshots"("id") ON DELETE cascade,
	"preset_id" text NOT NULL REFERENCES "seo_match_presets"("id") ON DELETE restrict,
	"preset_version" integer NOT NULL,
	"status" text NOT NULL,
	"both_count" integer DEFAULT 0 NOT NULL,
	"title_only_count" integer DEFAULT 0 NOT NULL,
	"url_only_count" integer DEFAULT 0 NOT NULL,
	"neither_count" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" real,
	"created_at" text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_api_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"request_data" text DEFAULT '{}' NOT NULL,
	"mode" text NOT NULL,
	"request_count" integer NOT NULL,
	"estimate_usd" real NOT NULL,
	"approved_cap_usd" real,
	"actual_usd" real,
	"status" text NOT NULL,
	"provider_task_ids" text DEFAULT '[]' NOT NULL,
	"error" text,
	"approved_at" text,
	"completed_at" text,
	"created_at" text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "seo_seeds_unique_project_seed_market_idx" ON "seo_seeds" USING btree ("project_id","normalized_seed","location_code","language_code");
--> statement-breakpoint
CREATE INDEX "seo_seeds_project_created_idx" ON "seo_seeds" USING btree ("project_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "seo_keywords_unique_project_keyword_market_idx" ON "seo_keywords" USING btree ("project_id","normalized_keyword","location_code","language_code");
--> statement-breakpoint
CREATE INDEX "seo_keywords_project_created_idx" ON "seo_keywords" USING btree ("project_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "seo_keyword_sources_unique_idx" ON "seo_keyword_sources" USING btree ("keyword_id","seed_id");
--> statement-breakpoint
CREATE INDEX "seo_keyword_sources_seed_idx" ON "seo_keyword_sources" USING btree ("seed_id");
--> statement-breakpoint
CREATE INDEX "seo_serp_snapshots_keyword_captured_idx" ON "seo_serp_snapshots" USING btree ("keyword_id","captured_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "seo_organic_results_unique_snapshot_rank_idx" ON "seo_organic_results" USING btree ("snapshot_id","rank");
--> statement-breakpoint
CREATE INDEX "seo_organic_results_snapshot_idx" ON "seo_organic_results" USING btree ("snapshot_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "seo_match_presets_unique_project_name_idx" ON "seo_match_presets" USING btree ("project_id","name");
--> statement-breakpoint
CREATE INDEX "seo_match_presets_project_idx" ON "seo_match_presets" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "seo_opportunity_assessments_snapshot_idx" ON "seo_opportunity_assessments" USING btree ("snapshot_id");
--> statement-breakpoint
CREATE INDEX "seo_opportunity_assessments_preset_idx" ON "seo_opportunity_assessments" USING btree ("preset_id","created_at");
--> statement-breakpoint
CREATE INDEX "seo_api_jobs_project_created_idx" ON "seo_api_jobs" USING btree ("project_id","created_at");
--> statement-breakpoint
CREATE INDEX "seo_api_jobs_project_status_idx" ON "seo_api_jobs" USING btree ("project_id","status");
