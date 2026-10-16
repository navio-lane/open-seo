import { z } from "zod";

const marketSchema = {
  locationCode: z.number().int().positive().default(2826),
  languageCode: z.string().min(2).max(12).default("en"),
};

export const seoAutocompleteInputSchema = z.object({
  seed: z.string().trim().min(1).max(700),
  ...marketSchema,
});

export const seoCollectAutocompleteSchema = z.object({
  jobId: z.string().uuid(),
  approvedCapUsd: z.number().min(0).max(1000),
});

export const seoSerpEstimateSchema = z.object({
  keywordId: z.string().uuid(),
  mode: z.enum(["live", "standard", "priority"]).default("live"),
  refresh: z.boolean().default(false),
});

export const seoCollectSerpSchema = z.object({
  jobId: z.string().uuid(),
  approvedCapUsd: z.number().min(0).max(1000),
});

export const seoSavedSerpSchema = z.object({
  keywordId: z.string().uuid(),
});

export const seoPollSerpSchema = z.object({ jobId: z.string().uuid() });
export const seoCancelJobSchema = z.object({ jobId: z.string().uuid() });

const matchRulesSchema = z.object({
  titleIgnoredWords: z.array(z.string().trim().min(1).max(50)).max(50),
  urlIgnoredWords: z.array(z.string().trim().min(1).max(50)).max(50),
  preserveOrder: z.boolean(),
  adjacentPhrase: z.boolean(),
  urlPathOnly: z.boolean(),
  ampersandEqualsAnd: z.boolean(),
});

export const seoMatchPresetSaveSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  rules: matchRulesSchema,
  isDefault: z.boolean(),
});

export const seoOpportunityReportSchema = z.object({
  keywordId: z.string().uuid(),
  presetId: z.string().uuid().optional(),
});
