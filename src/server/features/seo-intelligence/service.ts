import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { dataforseoPricing } from "@/server/lib/dataforseo/pricing";
import {
  createDataforseoClient,
  fetchSeoSerpTaskResult,
} from "@/server/lib/dataforseo";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";
import { SeoIntelligenceRepository as repository } from "./repository";
import {
  classifyOpportunity,
  classifyOrganicResult,
  type MatchRules,
} from "./matching";

const UK_LOCATION_CODE = 2826;
const DEFAULT_LANGUAGE_CODE = "en";
const SERP_DEPTH = 10;
const AUTOCOMPLETE_CLIENT = "gws-wiz-serp";
const SERP_MODES = {
  live: "Live mode",
  standard: "Standard queue",
  priority: "Priority queue",
} as const;

type SerpMode = keyof typeof SERP_MODES;

function chargedCost(error: unknown) {
  return error instanceof DataforseoChargedTaskError
    ? error.billing.costUsd
    : undefined;
}

function market(input: { locationCode?: number; languageCode?: string }) {
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
    alreadyCollected: existing.seedExists,
    savedSuggestions: existing.suggestions,
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
    throw new AppError(
      "CONFLICT",
      "This approval has expired or was already used.",
    );
  }
  if (input.approvedCapUsd < job.estimateUsd) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The approved task limit is below the current estimate.",
    );
  }
  if (
    !(await repository.markJobRunning(
      input.jobId,
      input.projectId,
      user.userId,
    ))
  ) {
    throw new AppError("CONFLICT", "This task is already running or complete.");
  }

  const request = JSON.parse(job.requestData) as {
    seed: string;
    locationCode: number;
    languageCode: string;
  };
  try {
    const client = createDataforseoClient(user);
    const result = await client.serp.researchAutocomplete({
      keyword: request.seed,
      locationCode: request.locationCode,
      languageCode: request.languageCode,
      client: AUTOCOMPLETE_CLIENT,
    });
    const suggestions = [
      ...new Set(
        result.items
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
      actualUsd: result.costUsd,
      approvedCapUsd: input.approvedCapUsd,
    });
    return { suggestions: saved, collectedCount: suggestions.length };
  } catch (error) {
    await repository.updateJob(input.jobId, {
      status: "error",
      approvedCapUsd: input.approvedCapUsd,
      actualUsd: chargedCost(error),
      error:
        error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
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
    estimateUsd:
      input.mode === "live"
        ? dataforseoPricing.serp.live({
            keyword: keyword.keyword,
            locationCode: keyword.locationCode,
            languageCode: keyword.languageCode,
            depth: SERP_DEPTH,
          })
        : dataforseoPricing.serp.researchTaskPost({
            keyword: keyword.keyword,
            locationCode: keyword.locationCode,
            languageCode: keyword.languageCode,
            mode: input.mode,
          }),
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
    throw new AppError(
      "CONFLICT",
      "This approval has expired or was already used.",
    );
  }
  if (input.approvedCapUsd < job.estimateUsd) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The approved task limit is below the current estimate.",
    );
  }
  if (
    !(await repository.markJobRunning(
      input.jobId,
      input.projectId,
      user.userId,
    ))
  ) {
    throw new AppError("CONFLICT", "This task is already running or complete.");
  }

  const request = JSON.parse(job.requestData) as {
    keywordId: string;
    locationCode: number;
    languageCode: string;
  };
  try {
    const keyword = await repository.getProjectKeyword(
      input.projectId,
      request.keywordId,
    );
    if (!keyword)
      throw new AppError("NOT_FOUND", "Suggested keyword not found.");
    if (job.mode === "live") {
      const live = await createDataforseoClient(user).serp.researchLive({
        keyword: keyword.keyword,
        locationCode: request.locationCode,
        languageCode: request.languageCode,
        depth: SERP_DEPTH,
      });
      const organic = mapOrganicItems(live.items);
      const snapshot = await repository.saveSerpSnapshot({
        keyword,
        ...request,
        mode: job.mode,
        aiOverviewStatus: live.aiOverviewStatus,
        results: organic,
      });
      await repository.updateJob(input.jobId, {
        status: "complete",
        actualUsd: live.costUsd,
        approvedCapUsd: input.approvedCapUsd,
      });
      return { pending: false as const, snapshot, keyword, results: organic };
    }
    const posted = await createDataforseoClient(user).serp.researchTaskPost({
      keyword: keyword.keyword,
      locationCode: request.locationCode,
      languageCode: request.languageCode,
      mode: job.mode as "standard" | "priority",
    });
    await repository.updateJob(input.jobId, {
      status: "queued",
      approvedCapUsd: input.approvedCapUsd,
      actualUsd: posted.costUsd,
      providerTaskIds: JSON.stringify([posted.taskId]),
    });
    return { pending: true as const, taskId: posted.taskId, mode: job.mode };
  } catch (error) {
    await repository.updateJob(input.jobId, {
      status: "error",
      approvedCapUsd: input.approvedCapUsd,
      actualUsd: chargedCost(error),
      error:
        error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
    });
    throw error;
  }
}

function mapOrganicItems(
  items: Array<{
    type: string;
    rank_group?: number | null;
    rank_absolute?: number | null;
    title?: string | null;
    url?: string | null;
  }>,
) {
  return items
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
}

async function pollSerp(
  input: { projectId: string; jobId: string },
  user: BillingCustomerContext,
) {
  const job = await repository.getApiJob(
    input.jobId,
    input.projectId,
    user.userId,
  );
  if (!job) throw new AppError("NOT_FOUND", "SERP task not found.");
  if (job.status !== "queued")
    throw new AppError("CONFLICT", "SERP task is not waiting for results.");
  const [taskId] = JSON.parse(job.providerTaskIds) as string[];
  if (!taskId) throw new AppError("INTERNAL_ERROR", "SERP task id is missing.");
  const outcome = await fetchSeoSerpTaskResult(taskId);
  if (outcome.status === "pending") return { pending: true as const };
  if (outcome.status === "failed") {
    await repository.updateJob(input.jobId, {
      status: "error",
      // task_post is the billable request. A failed task_get can report zero
      // even after DataForSEO charged for and completed the task, so never
      // overwrite the posted cost with a lower retrieval-response cost.
      actualUsd: Math.max(job.actualUsd ?? 0, outcome.costUsd),
      error: outcome.message,
    });
    return { pending: false as const, error: outcome.message };
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
  const results = mapOrganicItems(outcome.items);
  const snapshot = await repository.saveSerpSnapshot({
    keyword,
    ...request,
    mode: job.mode,
    providerTaskId: taskId,
    aiOverviewStatus: outcome.aiOverviewStatus,
    results,
  });
  await repository.updateJob(input.jobId, {
    status: "complete",
    actualUsd: outcome.costUsd,
  });
  return { pending: false as const, snapshot, keyword, results };
}

async function listQueuedSerpJobs(
  projectId: string,
  user: BillingCustomerContext,
) {
  return repository.listQueuedSerpJobs(projectId, user.userId);
}

async function listApiJobs(projectId: string, user: BillingCustomerContext) {
  return repository.listApiJobs(projectId, user.userId);
}

async function cancelPendingJob(
  input: { projectId: string; jobId: string },
  user: BillingCustomerContext,
) {
  if (
    !(await repository.cancelPendingJob(
      input.jobId,
      input.projectId,
      user.userId,
    ))
  ) {
    throw new AppError(
      "CONFLICT",
      "This approval has already been used or cancelled.",
    );
  }
  return { cancelled: true };
}

async function getSerp(projectId: string, keywordId: string) {
  const keyword = await repository.getProjectKeyword(projectId, keywordId);
  if (!keyword) throw new AppError("NOT_FOUND", "Suggested keyword not found.");
  return {
    keyword,
    snapshot: await repository.latestSerpForKeyword(keywordId),
  };
}

async function listMatchPresets(projectId: string) {
  return repository.ensureMatchPresets(projectId);
}

async function saveMatchPreset(input: {
  projectId: string;
  id?: string;
  name: string;
  rules: MatchRules;
  isDefault: boolean;
}) {
  const saved = await repository.saveMatchPreset(input);
  if (!saved)
    throw new AppError("INTERNAL_ERROR", "Could not save matching preset.");
  return saved;
}

async function getOpportunityReport(input: {
  projectId: string;
  keywordId: string;
  presetId?: string;
}) {
  const keyword = await repository.getProjectKeyword(
    input.projectId,
    input.keywordId,
  );
  if (!keyword) throw new AppError("NOT_FOUND", "Suggested keyword not found.");
  const presets = await repository.ensureMatchPresets(input.projectId);
  const preset = input.presetId
    ? await repository.getMatchPreset(input.projectId, input.presetId)
    : (presets.find((item) => item.isDefault) ?? null);
  if (!preset) throw new AppError("NOT_FOUND", "Matching preset not found.");
  const snapshot = await repository.latestSerpForKeyword(keyword.id);
  if (!snapshot)
    return {
      keyword,
      preset,
      snapshot: null,
      status: "not_analyzed" as const,
      results: [],
    };
  const validResults = snapshot.results.filter(
    (result) => result.rank > 0 && result.title.trim() && result.url.trim(),
  );
  const classifications = validResults.map((result) =>
    classifyOrganicResult(
      keyword.keyword,
      result.title,
      result.url,
      preset.rules,
    ),
  );
  const status = classifyOpportunity(
    classifications,
    new Set(validResults.map((result) => result.rank)).size,
  );
  const counts = {
    bothCount: classifications.filter((value) => value === "both").length,
    titleOnlyCount: classifications.filter((value) => value === "title_only")
      .length,
    urlOnlyCount: classifications.filter((value) => value === "url_only")
      .length,
    neitherCount: classifications.filter((value) => value === "neither").length,
  };
  await repository.saveOpportunityAssessment({
    snapshotId: snapshot.id,
    presetId: preset.id,
    presetVersion: preset.version,
    status,
    ...counts,
  });
  return {
    keyword,
    preset,
    snapshot,
    status,
    ...counts,
    results: validResults.map((result, index) => ({
      ...result,
      classification: classifications[index],
    })),
  };
}

async function getProjectOpportunityExport(input: {
  projectId: string;
  presetId?: string;
}) {
  const presets = await repository.ensureMatchPresets(input.projectId);
  const preset = input.presetId
    ? await repository.getMatchPreset(input.projectId, input.presetId)
    : (presets.find((item) => item.isDefault) ?? null);
  if (!preset) throw new AppError("NOT_FOUND", "Matching preset not found.");

  const [suggestions, snapshots] = await Promise.all([
    repository.listSuggestions(input.projectId),
    repository.listLatestSerpsForProject(input.projectId),
  ]);
  const seedsByKeyword = new Map(
    suggestions.map((suggestion) => [suggestion.id, suggestion.seeds]),
  );
  return snapshots.flatMap((snapshot) => {
    const validResults = snapshot.results.filter(
      (result) => result.rank > 0 && result.title.trim() && result.url.trim(),
    );
    const classifications = validResults.map((result) =>
      classifyOrganicResult(
        snapshot.keyword,
        result.title,
        result.url,
        preset.rules,
      ),
    );
    const opportunity = classifyOpportunity(
      classifications,
      new Set(validResults.map((result) => result.rank)).size,
    );
    if (opportunity !== "candidate" && opportunity !== "potential_candidate")
      return [];
    return [
      {
        keyword: snapshot.keyword,
        seeds: seedsByKeyword.get(snapshot.keywordId) ?? [],
        locationCode: snapshot.locationCode,
        languageCode: snapshot.languageCode,
        status: opportunity,
        presetName: preset.name,
        serpStatus: snapshot.status,
        resultCount: validResults.length,
        aiOverviewStatus: snapshot.aiOverviewStatus,
        bothCount: classifications.filter((value) => value === "both").length,
        capturedAt: snapshot.capturedAt,
      },
    ];
  });
}

async function getProjectSettings(projectId: string) {
  const [project] = await db
    .select({
      locationCode: projects.locationCode,
      languageCode: projects.languageCode,
    })
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
  pollSerp,
  listQueuedSerpJobs,
  listApiJobs,
  cancelPendingJob,
  listMatchPresets,
  saveMatchPreset,
  getOpportunityReport,
  getProjectOpportunityExport,
  getProjectSettings,
};

export type { SerpMode };
