import { eq } from "drizzle-orm";
import { db, projects } from "@/db";
import { dataforseoPricing } from "@/server/lib/dataforseo/pricing";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import { SeoIntelligenceRepository as repository } from "./repository";

const UK_LOCATION_CODE = 2826;
const DEFAULT_LANGUAGE_CODE = "en";
const SERP_DEPTH = 10;
const AUTOCOMPLETE_CLIENT = "gws-wiz-serp";
const SERP_MODES = {
  live: { label: "Live mode", price: 0.002 },
  standard: { label: "Standard queue", price: 0.0006 },
  priority: { label: "Priority queue", price: 0.0012 },
} as const;

type SerpMode = keyof typeof SERP_MODES;

function market(input: {
  locationCode?: number;
  languageCode?: string;
}) {
  return {
    locationCode: input.locationCode ?? UK_LOCATION_CODE,
    languageCode: input.languageCode ?? DEFAULT_LANGUAGE_CODE,
  };
}

async function estimateAutocomplete(input: {
  projectId: string;
  seed: string;
  locationCode?: number;
  languageCode?: string;
}) {
  const settings = market(input);
  const existing = await repository.listSuggestionsForSeed({
    projectId: input.projectId,
    seed: input.seed,
    ...settings,
  });
  return {
    endpoint: "Google Autocomplete Live Advanced",
    mode: "live",
    requestCount: 1,
    estimateUsd: dataforseoPricing.serp.autocomplete({
      keyword: input.seed,
      ...settings,
    }),
    settings,
    alreadyCollected: existing.length > 0,
    savedSuggestions: existing,
  };
}

async function prepareAutocomplete(
  input: {
    projectId: string;
    seed: string;
    locationCode?: number;
    languageCode?: string;
  },
  user: BillingCustomerContext,
) {
  const estimate = await estimateAutocomplete(input);
  if (estimate.alreadyCollected) return { ...estimate, jobId: null };
  const id = crypto.randomUUID();
  await repository.createApiJob({
    id,
    projectId: input.projectId,
    userId: user.userId,
    endpoint: estimate.endpoint,
    mode: estimate.mode,
    requestCount: estimate.requestCount,
    estimateUsd: estimate.estimateUsd,
    requestData: JSON.stringify({ seed: input.seed, ...estimate.settings }),
  });
  return { ...estimate, jobId: id };
}

async function collectAutocomplete(
  input: { projectId: string; jobId: string; approvedCapUsd: number },
  user: BillingCustomerContext,
) {
  const job = await repository.getApiJob(
    input.jobId,
    input.projectId,
    user.userId,
  );
  if (!job || job.status !== "pending") {
    throw new AppError("CONFLICT", "This approval has expired or was already used.");
  }
  if (input.approvedCapUsd < job.estimateUsd) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The approved task limit is below the current estimate.",
    );
  }
  if (!(await repository.markJobRunning(input.jobId, input.projectId, user.userId))) {
    throw new AppError("CONFLICT", "This task is already running or complete.");
  }

  const request = JSON.parse(job.requestData) as {
    seed: string;
    locationCode: number;
    languageCode: string;
  };
  try {
    const client = createDataforseoClient(user);
    const items = await client.serp.autocomplete({
      keyword: request.seed,
      locationCode: request.locationCode,
      languageCode: request.languageCode,
      client: AUTOCOMPLETE_CLIENT,
    });
    const suggestions = [
      ...new Set(
        items
          .filter((item) => item.type === "autocomplete")
          .map((item) => item.suggestion?.trim() ?? "")
          .filter(Boolean),
      ),
    ];
    const saved = await repository.saveAutocomplete({
      projectId: input.projectId,
      seed: request.seed,
      ...market(request),
      suggestions,
    });
    await repository.updateJob(input.jobId, {
      status: "complete",
      approvedCapUsd: input.approvedCapUsd,
    });
    return { suggestions: saved, collectedCount: suggestions.length };
  } catch (error) {
    await repository.updateJob(input.jobId, {
      status: "error",
      approvedCapUsd: input.approvedCapUsd,
      error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
    });
    throw error;
  }
}

async function listSuggestions(projectId: string) {
  return repository.listSuggestions(projectId);
}

async function estimateSerp(input: {
  projectId: string;
  keywordId: string;
  mode: SerpMode;
  refresh?: boolean;
}) {
  const keyword = await repository.getProjectKeyword(
    input.projectId,
    input.keywordId,
  );
  if (!keyword) throw new AppError("NOT_FOUND", "Suggested keyword not found.");
  const saved = await repository.latestSerpForKeyword(keyword.id);
  if (saved && !input.refresh) {
    return {
      keyword,
      mode: input.mode,
      requestCount: 0,
      estimateUsd: 0,
      savedSnapshot: saved,
    };
  }
  return {
    keyword,
    mode: input.mode,
    requestCount: 1,
    estimateUsd: SERP_MODES[input.mode].price,
    savedSnapshot: null,
  };
}

async function prepareSerp(
  input: {
    projectId: string;
    keywordId: string;
    mode: SerpMode;
    refresh?: boolean;
  },
  user: BillingCustomerContext,
) {
  const estimate = await estimateSerp(input);
  if (estimate.requestCount === 0) return { ...estimate, jobId: null };
  const settings = {
    locationCode: estimate.keyword.locationCode,
    languageCode: estimate.keyword.languageCode,
  };
  const id = crypto.randomUUID();
  await repository.createApiJob({
    id,
    projectId: input.projectId,
    userId: user.userId,
    endpoint: "Google Organic SERP",
    mode: input.mode,
    requestCount: 1,
    estimateUsd: estimate.estimateUsd,
    requestData: JSON.stringify({
      keywordId: input.keywordId,
      refresh: input.refresh ?? false,
      ...settings,
    }),
  });
  return { ...estimate, jobId: id };
}

async function collectSerp(
  input: { projectId: string; jobId: string; approvedCapUsd: number },
  user: BillingCustomerContext,
) {
  const job = await repository.getApiJob(
    input.jobId,
    input.projectId,
    user.userId,
  );
  if (!job || job.status !== "pending") {
    throw new AppError("CONFLICT", "This approval has expired or was already used.");
  }
  if (input.approvedCapUsd < job.estimateUsd) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The approved task limit is below the current estimate.",
    );
  }
  if (!(await repository.markJobRunning(input.jobId, input.projectId, user.userId))) {
    throw new AppError("CONFLICT", "This task is already running or complete.");
  }

  const request = JSON.parse(job.requestData) as {
    keywordId: string;
    locationCode: number;
    languageCode: string;
  };
  const keyword = await repository.getProjectKeyword(
    input.projectId,
    request.keywordId,
  );
  if (!keyword) throw new AppError("NOT_FOUND", "Suggested keyword not found.");
  try {
    // The first implementation deliberately uses Live mode. Queue modes are
    // selectable in estimates and will be connected to resumable task polling.
    if (job.mode !== "live") {
      throw new AppError(
        "VALIDATION_ERROR",
        "Queued SERP collection is not available yet. Choose Live mode.",
      );
    }
    const items = await createDataforseoClient(user).serp.live({
      keyword: keyword.keyword,
      locationCode: request.locationCode,
      languageCode: request.languageCode,
      depth: SERP_DEPTH,
    });
    const organic = items
      .filter((item) => item.type === "organic")
      .sort(
        (a, b) =>
          (a.rank_group ?? a.rank_absolute ?? Number.MAX_SAFE_INTEGER) -
          (b.rank_group ?? b.rank_absolute ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(0, 10)
      .map((item) => ({
        rank: item.rank_group ?? item.rank_absolute ?? 0,
        title: item.title ?? "",
        url: item.url ?? "",
        metadata: JSON.stringify(item),
      }));
    const snapshot = await repository.saveSerpSnapshot({
      keyword,
      ...request,
      mode: job.mode,
      results: organic,
    });
    await repository.updateJob(input.jobId, {
      status: "complete",
      approvedCapUsd: input.approvedCapUsd,
    });
    return { snapshot, keyword, results: organic };
  } catch (error) {
    await repository.updateJob(input.jobId, {
      status: "error",
      approvedCapUsd: input.approvedCapUsd,
      error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
    });
    throw error;
  }
}

async function getSerp(projectId: string, keywordId: string) {
  const keyword = await repository.getProjectKeyword(projectId, keywordId);
  if (!keyword) throw new AppError("NOT_FOUND", "Suggested keyword not found.");
  return {
    keyword,
    snapshot: await repository.latestSerpForKeyword(keywordId),
  };
}

async function getProjectSettings(projectId: string) {
  const [project] = await db
    .select({ locationCode: projects.locationCode, languageCode: projects.languageCode })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project ?? market({});
}

export const SeoIntelligenceService = {
  estimateAutocomplete,
  prepareAutocomplete,
  collectAutocomplete,
  listSuggestions,
  estimateSerp,
  prepareSerp,
  collectSerp,
  getSerp,
  getProjectSettings,
};

export type { SerpMode };
