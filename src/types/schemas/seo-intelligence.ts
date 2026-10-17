import { z } from "zod";

const marketSchema = {
  locationCode: z.number().int().positive().default(2826),
  languageCode: z.string().min(2).max(12).default("en"),
};

export const seoProjectSchema = z.object({ projectId: z.string().min(1) });
const projectScope = { projectId: z.string().min(1) };

export const seoAutocompleteInputSchema = z.object({
  ...projectScope,
  seed: z.string().trim().min(1).max(700),
  ...marketSchema,
});

export const seoCollectAutocompleteSchema = z.object({
  ...projectScope,
  jobId: z.string().uuid(),
  approvedCapUsd: z.number().min(0).max(1000),
});

export const seoSerpEstimateSchema = z.object({
  ...projectScope,
  keywordId: z.string().uuid(),
  mode: z.enum(["live", "standard", "priority"]).default("live"),
  refresh: z.boolean().default(false),
});

export const seoCollectSerpSchema = z.object({
  ...projectScope,
  jobId: z.string().uuid(),
  approvedCapUsd: z.number().min(0).max(1000),
});

export const seoSavedSerpSchema = z.object({
  ...projectScope,
  keywordId: z.string().uuid(),
});

export const seoPollSerpSchema = z.object({
  ...projectScope,
  jobId: z.string().uuid(),
});
export const seoCancelJobSchema = z.object({
  ...projectScope,
  jobId: z.string().uuid(),
});

const matchRulesSchema = z.object({
  titleIgnoredWords: z.array(z.string().trim().min(1).max(50)).max(50),
  urlIgnoredWords: z.array(z.string().trim().min(1).max(50)).max(50),
  preserveOrder: z.boolean(),
  adjacentPhrase: z.boolean(),
  urlPathOnly: z.boolean(),
  ampersandEqualsAnd: z.boolean(),
});

export const seoMatchPresetSaveSchema = z.object({
  ...projectScope,
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  rules: matchRulesSchema,
  isDefault: z.boolean(),
});

export const seoOpportunityReportSchema = z.object({
  ...projectScope,
  keywordId: z.string().uuid(),
  presetId: z.string().uuid().optional(),
});
