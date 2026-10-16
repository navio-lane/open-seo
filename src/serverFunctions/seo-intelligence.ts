import { createServerFn } from "@tanstack/react-start";
import { SeoIntelligenceService } from "@/server/features/seo-intelligence/service";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  seoAutocompleteInputSchema,
  seoCollectAutocompleteSchema,
  seoCollectSerpSchema,
  seoSavedSerpSchema,
  seoSerpEstimateSchema,
} from "@/types/schemas/seo-intelligence";

export const getSeoResearchSettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .handler(({ context }) =>
    SeoIntelligenceService.getProjectSettings(context.projectId),
  );

export const listSeoSuggestions = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
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
