import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  seoApiJobs,
  seoKeywordSources,
  seoKeywords,
  seoOrganicResults,
  seoSeeds,
  seoSerpSnapshots,
} from "@/db/schema";

export type SeoKeyword = typeof seoKeywords.$inferSelect;

function normalize(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
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
  return [...grouped.values()].map(({ seeds, ...item }) => ({
    ...item,
    seeds: [...seeds],
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
  if (!savedSeed) return [];
  const rows = await db
    .select({ id: seoKeywords.id, keyword: seoKeywords.keyword })
    .from(seoKeywordSources)
    .innerJoin(seoKeywords, eq(seoKeywords.id, seoKeywordSources.keywordId))
    .where(eq(seoKeywordSources.seedId, savedSeed.id))
    .orderBy(asc(seoKeywords.keyword));
  return rows;
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
    .set({ ...input, completedAt: new Date().toISOString() })
    .where(eq(seoApiJobs.id, id));
}

async function saveSerpSnapshot(input: {
  keyword: SeoKeyword;
  locationCode: number;
  languageCode: string;
  mode: string;
  providerTaskId?: string;
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
    .where(and(eq(seoKeywords.projectId, projectId), eq(seoKeywords.id, keywordId)))
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

export const SeoIntelligenceRepository = {
  saveAutocomplete,
  listSuggestions,
  listSuggestionsForSeed,
  createApiJob,
  getApiJob,
  markJobRunning,
  updateJob,
  getProjectKeyword,
  saveSerpSnapshot,
  latestSerpForKeyword,
};
