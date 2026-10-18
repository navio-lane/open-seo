import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";

export const seoSeeds = sqliteTable(
  "seo_seeds",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    seed: text("seed").notNull(),
    normalizedSeed: text("normalized_seed").notNull(),
    locationCode: integer("location_code").notNull().default(2826),
    languageCode: text("language_code").notNull().default("en"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("seo_seeds_unique_project_seed_market_idx").on(
      table.projectId,
      table.normalizedSeed,
      table.locationCode,
      table.languageCode,
    ),
    index("seo_seeds_project_created_idx").on(table.projectId, table.createdAt),
  ],
);

export const seoKeywords = sqliteTable(
  "seo_keywords",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    normalizedKeyword: text("normalized_keyword").notNull(),
    locationCode: integer("location_code").notNull().default(2826),
    languageCode: text("language_code").notNull().default("en"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("seo_keywords_unique_project_keyword_market_idx").on(
      table.projectId,
      table.normalizedKeyword,
      table.locationCode,
      table.languageCode,
    ),
    index("seo_keywords_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const seoKeywordSources = sqliteTable(
  "seo_keyword_sources",
  {
    keywordId: text("keyword_id")
      .notNull()
      .references(() => seoKeywords.id, { onDelete: "cascade" }),
    seedId: text("seed_id")
      .notNull()
      .references(() => seoSeeds.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("seo_keyword_sources_unique_idx").on(
      table.keywordId,
      table.seedId,
    ),
    index("seo_keyword_sources_seed_idx").on(table.seedId),
  ],
);

export const seoSerpSnapshots = sqliteTable(
  "seo_serp_snapshots",
  {
    id: text("id").primaryKey(),
    keywordId: text("keyword_id")
      .notNull()
      .references(() => seoKeywords.id, { onDelete: "cascade" }),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    device: text("device").notNull().default("desktop"),
    mode: text("mode").notNull(),
    status: text("status").notNull(),
    aiOverviewStatus: text("ai_overview_status"),
    resultCount: integer("result_count").notNull().default(0),
    providerTaskId: text("provider_task_id"),
    capturedAt: text("captured_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("seo_serp_snapshots_keyword_captured_idx").on(
      table.keywordId,
      table.capturedAt,
    ),
  ],
);

export const seoOrganicResults = sqliteTable(
  "seo_organic_results",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => seoSerpSnapshots.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    metadata: text("metadata"),
  },
  (table) => [
    uniqueIndex("seo_organic_results_unique_snapshot_rank_idx").on(
      table.snapshotId,
      table.rank,
    ),
    index("seo_organic_results_snapshot_idx").on(table.snapshotId),
  ],
);

export const seoMatchPresets = sqliteTable(
  "seo_match_presets",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    titleIgnoredWords: text("title_ignored_words").notNull().default("[]"),
    urlIgnoredWords: text("url_ignored_words")
      .notNull()
      .default('["a","an","the","and"]'),
    preserveOrder: integer("preserve_order", { mode: "boolean" })
      .notNull()
      .default(false),
    adjacentPhrase: integer("adjacent_phrase", { mode: "boolean" })
      .notNull()
      .default(false),
    urlPathOnly: integer("url_path_only", { mode: "boolean" })
      .notNull()
      .default(true),
    ampersandEqualsAnd: integer("ampersand_equals_and", { mode: "boolean" })
      .notNull()
      .default(true),
    version: integer("version").notNull().default(1),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("seo_match_presets_unique_project_name_idx").on(
      table.projectId,
      table.name,
    ),
    index("seo_match_presets_project_idx").on(table.projectId),
  ],
);

export const seoOpportunityAssessments = sqliteTable(
  "seo_opportunity_assessments",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => seoSerpSnapshots.id, { onDelete: "cascade" }),
    presetId: text("preset_id")
      .notNull()
      .references(() => seoMatchPresets.id, { onDelete: "restrict" }),
    presetVersion: integer("preset_version").notNull(),
    status: text("status").notNull(),
    bothCount: integer("both_count").notNull().default(0),
    titleOnlyCount: integer("title_only_count").notNull().default(0),
    urlOnlyCount: integer("url_only_count").notNull().default(0),
    neitherCount: integer("neither_count").notNull().default(0),
    estimatedCostUsd: real("estimated_cost_usd"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("seo_opportunity_assessments_snapshot_idx").on(table.snapshotId),
    index("seo_opportunity_assessments_preset_idx").on(
      table.presetId,
      table.createdAt,
    ),
  ],
);

export const seoApiJobs = sqliteTable(
  "seo_api_jobs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    requestData: text("request_data").notNull().default("{}"),
    mode: text("mode").notNull(),
    requestCount: integer("request_count").notNull(),
    estimateUsd: real("estimate_usd").notNull(),
    approvedCapUsd: real("approved_cap_usd"),
    actualUsd: real("actual_usd"),
    status: text("status").notNull(),
    providerTaskIds: text("provider_task_ids").notNull().default("[]"),
    error: text("error"),
    approvedAt: text("approved_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("seo_api_jobs_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    index("seo_api_jobs_project_status_idx").on(table.projectId, table.status),
  ],
);
