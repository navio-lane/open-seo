import { createServerFn } from "@tanstack/react-start";
import { SeoIntelligenceService } from "@/server/features/seo-intelligence/service";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  seoAutocompleteInputSchema,
  seoCollectAutocompleteSchema,
  seoCollectSerpSchema,
  seoSavedSerpSchema,
  seoSerpEstimateSchema,
  seoPollSerpSchema,
  seoMatchPresetSaveSchema,
  seoOpportunityReportSchema,
  seoCancelJobSchema,
  seoProjectSchema,
  seoOpportunityExportSchema,
} from "@/types/schemas/seo-intelligence";

export const getSeoResearchSettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(seoProjectSchema)
  .handler(({ context }) =>
    SeoIntelligenceService.getProjectSettings(context.projectId),
  );

export const listSeoSuggestions = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(seoProjectSchema)
  .handler(({ context }) =>
    SeoIntelligenceService.listSuggestions(context.projectId),
  );

export const prepareSeoAutocomplete = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(seoAutocompleteInputSchema)
  .handler(({ data, context }) =>
    SeoIntelligenceService.prepareAutocomplete(
      { ...data, projectId: context.projectId },
      context,
    ),
  );

export const collectSeoAutocomplete = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(seoCollectAutocompleteSchema)
  .handler(({ data, context }) =>
    SeoIntelligenceService.collectAutocomplete(
      { ...data, projectId: context.projectId },
      context,
    ),
  );

export const prepareSeoSerp = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(seoSerpEstimateSchema)
  .handler(({ data, context }) =>
    SeoIntelligenceService.prepareSerp(
      { ...data, projectId: context.projectId },
      context,
    ),
  );

export const collectSeoSerp = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(seoCollectSerpSchema)
  .handler(({ data, context }) =>
    SeoIntelligenceService.collectSerp(
      { ...data, projectId: context.projectId },
      context,
    ),
  );

export const getSavedSeoSerp = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(seoSavedSerpSchema)
  .handler(({ data, context }) =>
    SeoIntelligenceService.getSerp(context.projectId, data.keywordId),
  );

export const pollSeoSerp = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(seoPollSerpSchema)
  .handler(({ data, context }) =>
    SeoIntelligenceService.pollSerp(
      { ...data, projectId: context.projectId },
      context,
    ),
  );

export const listQueuedSeoSerpJobs = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(seoProjectSchema)
  .handler(({ context }) =>
    SeoIntelligenceService.listQueuedSerpJobs(context.projectId, context),
  );

export const listSeoApiJobs = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(seoProjectSchema)
  .handler(({ context }) =>
    SeoIntelligenceService.listApiJobs(context.projectId, context),
  );

export const listSeoMatchPresets = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(seoProjectSchema)
  .handler(({ context }) =>
    SeoIntelligenceService.listMatchPresets(context.projectId),
  );

export const saveSeoMatchPreset = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(seoMatchPresetSaveSchema)
  .handler(({ data, context }) =>
    SeoIntelligenceService.saveMatchPreset({
      ...data,
      projectId: context.projectId,
    }),
  );

export const getSeoOpportunityReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(seoOpportunityReportSchema)
  .handler(({ data, context }) =>
    SeoIntelligenceService.getOpportunityReport({
      ...data,
      projectId: context.projectId,
    }),
  );

export const getSeoProjectOpportunityExport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(seoOpportunityExportSchema)
  .handler(({ data, context }) =>
    SeoIntelligenceService.getProjectOpportunityExport({
      ...data,
      projectId: context.projectId,
    }),
  );

export const cancelSeoPaidJob = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(seoCancelJobSchema)
  .handler(({ data, context }) =>
    SeoIntelligenceService.cancelPendingJob(
      { ...data, projectId: context.projectId },
      context,
    ),
  );
