import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  seoApiJobs,
  seoKeywordSources,
  seoKeywords,
  seoMatchPresets,
  seoOrganicResults,
  seoOpportunityAssessments,
  seoSeeds,
  seoSerpSnapshots,
} from "@/db/schema";
import {
  FLEXIBLE_MATCH_RULES,
  STRICT_MATCH_RULES,
  type MatchRules,
} from "./matching";

export type SeoKeyword = typeof seoKeywords.$inferSelect;
type MatchPreset = typeof seoMatchPresets.$inferSelect;

function serializePreset(preset: MatchPreset) {
  return {
    ...preset,
    rules: {
      titleIgnoredWords: JSON.parse(preset.titleIgnoredWords) as string[],
      urlIgnoredWords: JSON.parse(preset.urlIgnoredWords) as string[],
      preserveOrder: preset.preserveOrder,
      adjacentPhrase: preset.adjacentPhrase,
      urlPathOnly: preset.urlPathOnly,
      ampersandEqualsAnd: preset.ampersandEqualsAnd,
    } satisfies MatchRules,
  };
}

async function ensureMatchPresets(projectId: string) {
  const current = await db
    .select()
    .from(seoMatchPresets)
    .where(eq(seoMatchPresets.projectId, projectId));
  const add = async (name: string, rules: MatchRules, isDefault: boolean) => {
    await db
      .insert(seoMatchPresets)
      .values({
        id: crypto.randomUUID(),
        projectId,
        name,
        titleIgnoredWords: JSON.stringify(rules.titleIgnoredWords),
        urlIgnoredWords: JSON.stringify(rules.urlIgnoredWords),
        preserveOrder: rules.preserveOrder,
        adjacentPhrase: rules.adjacentPhrase,
        urlPathOnly: rules.urlPathOnly,
        ampersandEqualsAnd: rules.ampersandEqualsAnd,
        isDefault,
      })
      .onConflictDoNothing();
  };
  if (!current.some((preset) => preset.isDefault))
    await add("Flexible", FLEXIBLE_MATCH_RULES, true);
  if (!current.some((preset) => preset.name === "Strict"))
    await add("Strict", STRICT_MATCH_RULES, false);
  const rows = await db
    .select()
    .from(seoMatchPresets)
    .where(eq(seoMatchPresets.projectId, projectId))
    .orderBy(asc(seoMatchPresets.createdAt));
  return rows.map(serializePreset);
}

async function saveMatchPreset(input: {
  projectId: string;
  id?: string;
  name: string;
  rules: MatchRules;
  isDefault: boolean;
}) {
  const id = input.id ?? crypto.randomUUID();
  const values = {
    name: input.name.trim(),
    titleIgnoredWords: JSON.stringify(input.rules.titleIgnoredWords),
    urlIgnoredWords: JSON.stringify(input.rules.urlIgnoredWords),
    preserveOrder: input.rules.preserveOrder,
    adjacentPhrase: input.rules.adjacentPhrase,
    urlPathOnly: input.rules.urlPathOnly,
    ampersandEqualsAnd: input.rules.ampersandEqualsAnd,
    isDefault: input.isDefault,
    version: sql`${seoMatchPresets.version} + 1`,
  };
  const existing = input.id
    ? await db
        .select({ id: seoMatchPresets.id })
        .from(seoMatchPresets)
        .where(
          and(
            eq(seoMatchPresets.id, input.id),
            eq(seoMatchPresets.projectId, input.projectId),
          ),
        )
        .limit(1)
    : [];
  if (existing.length) {
    await db
      .update(seoMatchPresets)
      .set(values)
      .where(
        and(
          eq(seoMatchPresets.id, id),
          eq(seoMatchPresets.projectId, input.projectId),
        ),
      );
  } else {
    const { version: _version, ...createValues } = values;
    await db
      .insert(seoMatchPresets)
      .values({ id, projectId: input.projectId, ...createValues });
  }
  if (input.isDefault) {
    await db
      .update(seoMatchPresets)
      .set({ isDefault: false })
      .where(eq(seoMatchPresets.projectId, input.projectId));
    await db
      .update(seoMatchPresets)
      .set({ isDefault: true })
      .where(
        and(
          eq(seoMatchPresets.projectId, input.projectId),
          eq(seoMatchPresets.id, id),
        ),
      );
  }
  return getMatchPreset(input.projectId, id);
}

async function getMatchPreset(projectId: string, id: string) {
  const [preset] = await db
    .select()
    .from(seoMatchPresets)
    .where(
      and(eq(seoMatchPresets.projectId, projectId), eq(seoMatchPresets.id, id)),
    )
    .limit(1);
  return preset ? serializePreset(preset) : null;
}

async function saveOpportunityAssessment(input: {
  snapshotId: string;
  presetId: string;
  presetVersion: number;
  status: string;
  bothCount: number;
  titleOnlyCount: number;
  urlOnlyCount: number;
  neitherCount: number;
}) {
  const id = crypto.randomUUID();
  await db.insert(seoOpportunityAssessments).values({ id, ...input });
  return { id, ...input };
}

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

async function ensureSeed(input: {
  projectId: string;
  seed: string;
  locationCode: number;
  languageCode: string;
}) {
  const normalizedSeed = normalize(input.seed);
  await db
    .insert(seoSeeds)
    .values({
      id: crypto.randomUUID(),
      ...input,
      normalizedSeed,
    })
    .onConflictDoNothing();
  const [seed] = await db
    .select()
    .from(seoSeeds)
    .where(
      and(
        eq(seoSeeds.projectId, input.projectId),
        eq(seoSeeds.normalizedSeed, normalizedSeed),
        eq(seoSeeds.locationCode, input.locationCode),
        eq(seoSeeds.languageCode, input.languageCode),
      ),
    )
    .limit(1);
  if (!seed) throw new Error("Failed to save SEO research seed");
  return seed;
}

async function saveAutocomplete(input: {
  projectId: string;
  seed: string;
  locationCode: number;
  languageCode: string;
  suggestions: string[];
}) {
  const seed = await ensureSeed(input);
  for (const suggestion of input.suggestions) {
    const keyword = suggestion.trim().replace(/\s+/g, " ");
    const normalizedKeyword = normalize(keyword);
    if (!normalizedKeyword) continue;

    await db
      .insert(seoKeywords)
      .values({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        keyword,
        normalizedKeyword,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
      })
      .onConflictDoNothing();
    const [savedKeyword] = await db
      .select()
      .from(seoKeywords)
      .where(
        and(
          eq(seoKeywords.projectId, input.projectId),
          eq(seoKeywords.normalizedKeyword, normalizedKeyword),
          eq(seoKeywords.locationCode, input.locationCode),
          eq(seoKeywords.languageCode, input.languageCode),
        ),
      )
      .limit(1);
    if (!savedKeyword) throw new Error("Failed to save suggested keyword");

    await db
      .insert(seoKeywordSources)
      .values({ keywordId: savedKeyword.id, seedId: seed.id })
      .onConflictDoNothing();
  }
  return listSuggestions(input.projectId);
}

async function listSuggestions(projectId: string) {
  const rows = await db
    .select({
      id: seoKeywords.id,
      keyword: seoKeywords.keyword,
      locationCode: seoKeywords.locationCode,
      languageCode: seoKeywords.languageCode,
      seed: seoSeeds.seed,
      createdAt: seoKeywords.createdAt,
    })
    .from(seoKeywords)
    .leftJoin(
      seoKeywordSources,
      eq(seoKeywordSources.keywordId, seoKeywords.id),
    )
    .leftJoin(seoSeeds, eq(seoSeeds.id, seoKeywordSources.seedId))
    .where(eq(seoKeywords.projectId, projectId))
    .orderBy(desc(seoKeywords.createdAt), asc(seoKeywords.keyword));

  const grouped = new Map<
    string,
    {
      id: string;
      keyword: string;
      locationCode: number;
      languageCode: string;
      createdAt: string;
      seeds: Set<string>;
    }
  >();
  for (const row of rows) {
    let item = grouped.get(row.id);
    if (!item) {
      item = {
        id: row.id,
        keyword: row.keyword,
        locationCode: row.locationCode,
        languageCode: row.languageCode,
        createdAt: row.createdAt,
        seeds: new Set(),
      };
      grouped.set(row.id, item);
    }
    if (row.seed) item.seeds.add(row.seed);
  }
  const snapshots = await db
    .select({
      keywordId: seoSerpSnapshots.keywordId,
      aiOverviewStatus: seoSerpSnapshots.aiOverviewStatus,
    })
    .from(seoSerpSnapshots)
    .innerJoin(seoKeywords, eq(seoKeywords.id, seoSerpSnapshots.keywordId))
    .where(eq(seoKeywords.projectId, projectId))
    .orderBy(desc(seoSerpSnapshots.capturedAt), desc(seoSerpSnapshots.id));
  const aiOverviewByKeyword = new Map<string, string | null>();
  for (const snapshot of snapshots) {
    if (!aiOverviewByKeyword.has(snapshot.keywordId))
      aiOverviewByKeyword.set(snapshot.keywordId, snapshot.aiOverviewStatus);
  }
  return [...grouped.values()].map(({ seeds, ...item }) => ({
    ...item,
    seeds: [...seeds],
    aiOverviewStatus: aiOverviewByKeyword.get(item.id) ?? null,
  }));
}

async function listSuggestionsForSeed(input: {
  projectId: string;
  seed: string;
  locationCode: number;
  languageCode: string;
}) {
  const [savedSeed] = await db
    .select()
    .from(seoSeeds)
    .where(
      and(
        eq(seoSeeds.projectId, input.projectId),
        eq(seoSeeds.normalizedSeed, normalize(input.seed)),
        eq(seoSeeds.locationCode, input.locationCode),
        eq(seoSeeds.languageCode, input.languageCode),
      ),
    )
    .limit(1);
  if (!savedSeed) return { seedExists: false, suggestions: [] };
  const rows = await db
    .select({ id: seoKeywords.id, keyword: seoKeywords.keyword })
    .from(seoKeywordSources)
    .innerJoin(seoKeywords, eq(seoKeywords.id, seoKeywordSources.keywordId))
    .where(eq(seoKeywordSources.seedId, savedSeed.id))
    .orderBy(asc(seoKeywords.keyword));
  return { seedExists: true, suggestions: rows };
}

async function createApiJob(input: {
  id: string;
  projectId: string;
  userId: string;
  endpoint: string;
  mode: string;
  requestCount: number;
  estimateUsd: number;
  requestData: string;
}) {
  await db.insert(seoApiJobs).values({ ...input, status: "pending" });
}

async function getApiJob(id: string, projectId: string, userId: string) {
  const [job] = await db
    .select()
    .from(seoApiJobs)
    .where(
      and(
        eq(seoApiJobs.id, id),
        eq(seoApiJobs.projectId, projectId),
        eq(seoApiJobs.userId, userId),
      ),
    )
    .limit(1);
  return job ?? null;
}

async function listQueuedSerpJobs(projectId: string, userId: string) {
  return db
    .select({ id: seoApiJobs.id })
    .from(seoApiJobs)
    .where(
      and(
        eq(seoApiJobs.projectId, projectId),
        eq(seoApiJobs.userId, userId),
        eq(seoApiJobs.endpoint, "Google Organic SERP"),
        eq(seoApiJobs.status, "queued"),
      ),
    );
}

async function listApiJobs(projectId: string, userId: string) {
  return db
    .select({
      id: seoApiJobs.id,
      endpoint: seoApiJobs.endpoint,
      mode: seoApiJobs.mode,
      requestCount: seoApiJobs.requestCount,
      estimateUsd: seoApiJobs.estimateUsd,
      actualUsd: seoApiJobs.actualUsd,
      status: seoApiJobs.status,
      error: seoApiJobs.error,
      createdAt: seoApiJobs.createdAt,
    })
    .from(seoApiJobs)
    .where(
      and(eq(seoApiJobs.projectId, projectId), eq(seoApiJobs.userId, userId)),
    )
    .orderBy(desc(seoApiJobs.createdAt))
    .limit(50);
}

async function cancelPendingJob(id: string, projectId: string, userId: string) {
  const rows = await db
    .update(seoApiJobs)
    .set({ status: "cancelled", completedAt: new Date().toISOString() })
    .where(
      and(
        eq(seoApiJobs.id, id),
        eq(seoApiJobs.projectId, projectId),
        eq(seoApiJobs.userId, userId),
        eq(seoApiJobs.status, "pending"),
      ),
    )
    .returning({ id: seoApiJobs.id });
  return rows.length === 1;
}

async function markJobRunning(id: string, projectId: string, userId: string) {
  const rows = await db
    .update(seoApiJobs)
    .set({ status: "running", approvedAt: new Date().toISOString() })
    .where(
      and(
        eq(seoApiJobs.id, id),
        eq(seoApiJobs.projectId, projectId),
        eq(seoApiJobs.userId, userId),
        eq(seoApiJobs.status, "pending"),
      ),
    )
    .returning({ id: seoApiJobs.id });
  return rows.length === 1;
}

async function updateJob(
  id: string,
  input: {
    status: string;
    approvedCapUsd?: number;
    actualUsd?: number;
    error?: string;
    providerTaskIds?: string;
  },
) {
  await db
    .update(seoApiJobs)
    .set({
      ...input,
      ...(input.status === "complete" ||
      input.status === "error" ||
      input.status === "cancelled"
        ? { completedAt: new Date().toISOString() }
        : {}),
    })
    .where(eq(seoApiJobs.id, id));
}

async function saveSerpSnapshot(input: {
  keyword: SeoKeyword;
  locationCode: number;
  languageCode: string;
  mode: string;
  providerTaskId?: string;
  aiOverviewStatus: "yes" | "no" | null;
  results: Array<{
    rank: number;
    title: string;
    url: string;
    metadata?: string;
  }>;
}) {
  const id = crypto.randomUUID();
  const validResultCount = input.results.filter(
    (result) => result.title.trim() && result.url.trim() && result.rank > 0,
  ).length;
  await db.insert(seoSerpSnapshots).values({
    id,
    keywordId: input.keyword.id,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    mode: input.mode,
    status: validResultCount === 10 ? "complete" : "incomplete",
    aiOverviewStatus: input.aiOverviewStatus,
    resultCount: validResultCount,
    providerTaskId: input.providerTaskId,
  });
  if (input.results.length) {
    await db.insert(seoOrganicResults).values(
      input.results.map((result) => ({
        id: crypto.randomUUID(),
        snapshotId: id,
        ...result,
      })),
    );
  }
  return { id, status: validResultCount === 10 ? "complete" : "incomplete" };
}

async function getProjectKeyword(projectId: string, keywordId: string) {
  const [keyword] = await db
    .select()
    .from(seoKeywords)
    .where(
      and(eq(seoKeywords.projectId, projectId), eq(seoKeywords.id, keywordId)),
    )
    .limit(1);
  return keyword ?? null;
}

async function latestSerpForKeyword(keywordId: string) {
  const [snapshot] = await db
    .select()
    .from(seoSerpSnapshots)
    .where(eq(seoSerpSnapshots.keywordId, keywordId))
    .orderBy(desc(seoSerpSnapshots.capturedAt))
    .limit(1);
  if (!snapshot) return null;
  const results = await db
    .select()
    .from(seoOrganicResults)
    .where(eq(seoOrganicResults.snapshotId, snapshot.id))
    .orderBy(asc(seoOrganicResults.rank));
  return { ...snapshot, results };
}

async function listLatestSerpsForProject(projectId: string) {
  const snapshots = await db
    .select({
      keywordId: seoKeywords.id,
      keyword: seoKeywords.keyword,
      locationCode: seoKeywords.locationCode,
      languageCode: seoKeywords.languageCode,
      snapshotId: seoSerpSnapshots.id,
      status: seoSerpSnapshots.status,
      resultCount: seoSerpSnapshots.resultCount,
      aiOverviewStatus: seoSerpSnapshots.aiOverviewStatus,
      capturedAt: seoSerpSnapshots.capturedAt,
    })
    .from(seoSerpSnapshots)
    .innerJoin(seoKeywords, eq(seoKeywords.id, seoSerpSnapshots.keywordId))
    .where(eq(seoKeywords.projectId, projectId))
    .orderBy(desc(seoSerpSnapshots.capturedAt), desc(seoSerpSnapshots.id));
  const latestByKeyword = new Map<string, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) {
    if (!latestByKeyword.has(snapshot.keywordId))
      latestByKeyword.set(snapshot.keywordId, snapshot);
  }
  const latest = [...latestByKeyword.values()];
  if (latest.length === 0) return [];

  const snapshotIds = latest.map((snapshot) => snapshot.snapshotId);
  const results = await db
    .select()
    .from(seoOrganicResults)
    .where(inArray(seoOrganicResults.snapshotId, snapshotIds))
    .orderBy(asc(seoOrganicResults.rank));
  const resultsBySnapshot = new Map<string, typeof results>();
  for (const result of results) {
    const snapshotResults = resultsBySnapshot.get(result.snapshotId) ?? [];
    snapshotResults.push(result);
    resultsBySnapshot.set(result.snapshotId, snapshotResults);
  }
  return latest.map((snapshot) => ({
    ...snapshot,
    results: resultsBySnapshot.get(snapshot.snapshotId) ?? [],
  }));
}

export const SeoIntelligenceRepository = {
  saveAutocomplete,
  listSuggestions,
  listSuggestionsForSeed,
  createApiJob,
  getApiJob,
  listQueuedSerpJobs,
  listApiJobs,
  cancelPendingJob,
  markJobRunning,
  updateJob,
  getProjectKeyword,
  saveSerpSnapshot,
  latestSerpForKeyword,
  listLatestSerpsForProject,
  ensureMatchPresets,
  saveMatchPreset,
  getMatchPreset,
  saveOpportunityAssessment,
};
