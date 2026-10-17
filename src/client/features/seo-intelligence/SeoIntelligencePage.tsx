import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import {
  collectSeoAutocomplete,
  collectSeoSerp,
  cancelSeoPaidJob,
  getSavedSeoSerp,
  getSeoOpportunityReport,
  getSeoProjectOpportunityExport,
  listSeoApiJobs,
  listQueuedSeoSerpJobs,
  listSeoMatchPresets,
  listSeoSuggestions,
  pollSeoSerp,
  prepareSeoAutocomplete,
  prepareSeoSerp,
  saveSeoMatchPreset,
} from "@/serverFunctions/seo-intelligence";
import type { MatchRules } from "@/server/features/seo-intelligence/matching";
import {
  getLanguageCode,
  getLanguageOptions,
  LOCATION_OPTIONS,
} from "@/shared/keyword-locations";

type Suggestion = Awaited<ReturnType<typeof listSeoSuggestions>>[number];
type SavedSerp = Awaited<ReturnType<typeof getSavedSeoSerp>>;
type MatchPreset = Awaited<ReturnType<typeof listSeoMatchPresets>>[number];
type OpportunityReport = Awaited<ReturnType<typeof getSeoOpportunityReport>>;
type ApiJob = Awaited<ReturnType<typeof listSeoApiJobs>>[number];
type Approval =
  | {
      type: "autocomplete";
      jobId: string;
      estimateUsd: number;
      capUsd: number;
      seed: string;
    }
  | {
      type: "serp";
      jobs: Array<{ jobId: string; keywordId: string }>;
      estimateUsd: number;
      capUsd: number;
      mode: "live" | "standard" | "priority";
    };

function money(value: number) {
  return `$${value.toFixed(4)}`;
}

function serpModeLabel(mode: "live" | "standard" | "priority") {
  return mode === "live"
    ? "Live mode"
    : mode === "standard"
      ? "Standard queue"
      : "Priority queue";
}

function parseIgnoredWords(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((word) => word.trim().toLocaleLowerCase())
        .filter(Boolean),
    ),
  ];
}

function ignoredWordsText(rules: MatchRules) {
  return {
    titleIgnoredWords: rules.titleIgnoredWords.join(", "),
    urlIgnoredWords: rules.urlIgnoredWords.join(", "),
  };
}

export function SeoIntelligencePage({ projectId }: { projectId: string }) {
  const [seed, setSeed] = useState("");
  const [locationCode, setLocationCode] = useState(2826);
  const [languageCode, setLanguageCode] = useState("en");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [activeSerp, setActiveSerp] = useState<SavedSerp | null>(null);
  const [serpMode, setSerpMode] = useState<"live" | "standard" | "priority">(
    "live",
  );
  const [pendingJobIds, setPendingJobIds] = useState<string[]>([]);
  const [apiJobs, setApiJobs] = useState<ApiJob[]>([]);
  const [presets, setPresets] = useState<MatchPreset[]>([]);
  const [presetId, setPresetId] = useState("");
  const [presetName, setPresetName] = useState("Flexible");
  const [rules, setRules] = useState<MatchRules>({
    titleIgnoredWords: [],
    urlIgnoredWords: ["a", "an", "the", "and"],
    preserveOrder: false,
    adjacentPhrase: false,
    urlPathOnly: true,
    ampersandEqualsAnd: true,
  });
  const [ignoredWordsDraft, setIgnoredWordsDraft] = useState({
    titleIgnoredWords: "",
    urlIgnoredWords: "a, an, the, and",
  });
  const [report, setReport] = useState<OpportunityReport | null>(null);
  const [loading, setLoading] = useState(false);

  const reloadSuggestions = useCallback(async () => {
    const rows = await listSeoSuggestions({ data: { projectId } });
    setSuggestions(rows);
    setSelected((current) =>
      current.filter((id) => rows.some((row) => row.id === id)),
    );
  }, []);

  const reloadApiJobs = useCallback(async () => {
    setApiJobs(await listSeoApiJobs({ data: { projectId } }));
  }, [projectId]);

  useEffect(() => {
    void reloadSuggestions().catch((error: unknown) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load saved keywords.",
      );
    });
  }, [projectId, reloadSuggestions]);

  useEffect(() => {
    void reloadApiJobs().catch((error: unknown) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load DataForSEO task history.",
      );
    });
  }, [projectId, reloadApiJobs]);

  useEffect(() => {
    void Promise.all([
      listSeoMatchPresets({ data: { projectId } }),
      listQueuedSeoSerpJobs({ data: { projectId } }),
    ])
      .then(([savedPresets, queuedJobs]) => {
        setPresets(savedPresets);
        setPendingJobIds(queuedJobs.map((job) => job.id));
        const selectedPreset =
          savedPresets.find((preset) => preset.isDefault) ?? savedPresets[0];
        if (selectedPreset) {
          setPresetId(selectedPreset.id);
          setPresetName(selectedPreset.name);
          setRules(selectedPreset.rules);
          setIgnoredWordsDraft(ignoredWordsText(selectedPreset.rules));
        }
      })
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not load matching settings.",
        ),
      );
  }, [projectId]);

  useEffect(() => {
    if (pendingJobIds.length === 0) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;
    let pollDelay = 15_000;
    const poll = async () => {
      const finished: string[] = [];
      for (const jobId of pendingJobIds) {
        try {
          const outcome = await pollSeoSerp({ data: { projectId, jobId } });
          if (outcome.pending) continue;
          finished.push(jobId);
          if ("error" in outcome)
            toast.error(`Queued SERP failed: ${outcome.error}`);
          else
            setActiveSerp(
              await getSavedSeoSerp({
                data: { projectId, keywordId: outcome.keyword.id },
              }),
            );
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not check queued SERP status.",
          );
        }
      }
      if (cancelled) return;
      if (finished.length)
        setPendingJobIds((current) =>
          current.filter((id) => !finished.includes(id)),
        );
      if (finished.length) void reloadApiJobs();
      timeout = setTimeout(() => {
        pollDelay = Math.min(pollDelay * 1.5, 60_000);
        void poll();
      }, pollDelay);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [pendingJobIds, projectId, reloadApiJobs]);

  async function prepareAutocomplete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!seed.trim() || loading) return;
    setLoading(true);
    try {
      const prepared = await prepareSeoAutocomplete({
        data: { projectId, seed: seed.trim(), locationCode, languageCode },
      });
      if (prepared.alreadyCollected) {
        await reloadSuggestions();
        await reloadApiJobs();
        toast.message(
          "This seed was already collected; no new API request was made.",
        );
      } else if (prepared.jobId) {
        setApproval({
          type: "autocomplete",
          jobId: prepared.jobId,
          estimateUsd: prepared.estimateUsd,
          capUsd: prepared.estimateUsd,
          seed: seed.trim(),
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not prepare collection.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function prepareSerp(keywordIds: string | string[], refresh = false) {
    if (loading) return;
    const ids = [
      ...new Set(Array.isArray(keywordIds) ? keywordIds : [keywordIds]),
    ];
    const limit = serpMode === "live" ? 3 : 10;
    if (ids.length > limit) {
      toast.error(
        `${serpModeLabel(serpMode)} supports up to ${limit} keywords per approval.`,
      );
      return;
    }
    setLoading(true);
    const preparedJobs: string[] = [];
    try {
      const prepared = [];
      for (const keywordId of ids) {
        const result = await prepareSeoSerp({
          data: { projectId, keywordId, mode: serpMode, refresh },
        });
        if (result.jobId) preparedJobs.push(result.jobId);
        prepared.push(result);
      }
      const toCollect = prepared.flatMap((item) =>
        item.jobId ? [{ jobId: item.jobId, keywordId: item.keyword.id }] : [],
      );
      const cached = prepared.find((item) => item.savedSnapshot);
      if (cached?.savedSnapshot) {
        setActiveSerp({
          keyword: cached.keyword,
          snapshot: cached.savedSnapshot,
        });
      }
      if (!toCollect.length) {
        toast.message("Showing saved SERP data; no new API request was made.");
      } else {
        const estimateUsd = prepared.reduce(
          (sum, item) => sum + item.estimateUsd,
          0,
        );
        setApproval({
          type: "serp",
          jobs: toCollect,
          estimateUsd,
          capUsd: estimateUsd,
          mode: serpMode,
        });
      }
    } catch (error) {
      await Promise.allSettled(
        preparedJobs.map((jobId) =>
          cancelSeoPaidJob({ data: { projectId, jobId } }),
        ),
      );
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not prepare SERP analysis.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function confirmApproval() {
    if (!approval || loading) return;
    setLoading(true);
    const queuedJobIds: string[] = [];
    try {
      if (approval.type === "autocomplete") {
        await collectSeoAutocomplete({
          data: {
            projectId,
            jobId: approval.jobId,
            approvedCapUsd: approval.capUsd,
          },
        });
        await reloadSuggestions();
        setSeed("");
        toast.success("Autocomplete suggestions saved.");
      } else {
        let saved = 0;
        for (const task of approval.jobs) {
          const result = await collectSeoSerp({
            data: {
              projectId,
              jobId: task.jobId,
              approvedCapUsd: approval.capUsd,
            },
          });
          if (result.pending) queuedJobIds.push(task.jobId);
          else {
            saved += 1;
            setActiveSerp(
              await getSavedSeoSerp({
                data: { projectId, keywordId: result.keyword.id },
              }),
            );
          }
        }
        if (queuedJobIds.length)
          setPendingJobIds((current) => [
            ...new Set([...current, ...queuedJobIds]),
          ]);
        toast.message(
          queuedJobIds.length
            ? `${queuedJobIds.length} ${serpModeLabel(approval.mode)} task(s) submitted; ${saved} saved immediately.`
            : `${saved} SERP result(s) saved.`,
        );
        await reloadApiJobs();
      }
      setApproval(null);
    } catch (error) {
      if (approval.type === "serp") {
        await Promise.allSettled(
          approval.jobs.map(({ jobId }) =>
            cancelSeoPaidJob({ data: { projectId, jobId } }),
          ),
        );
        if (queuedJobIds.length)
          setPendingJobIds((current) => [
            ...new Set([...current, ...queuedJobIds]),
          ]);
        setApproval(null);
      }
      void reloadApiJobs();
      toast.error(
        error instanceof Error ? error.message : "The approved task failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function cancelApproval() {
    if (!approval) return;
    try {
      const ids =
        approval.type === "serp"
          ? approval.jobs.map((job) => job.jobId)
          : [approval.jobId];
      await Promise.all(
          ids.map((jobId) =>
            cancelSeoPaidJob({ data: { projectId, jobId } }),
          ),
      );
      setApproval(null);
      await reloadApiJobs();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not cancel this approval.",
      );
    }
  }

  function selectPreset(preset: MatchPreset) {
    setPresetId(preset.id);
    setPresetName(preset.name);
    setRules(preset.rules);
    setIgnoredWordsDraft(ignoredWordsText(preset.rules));
    setReport(null);
  }

  async function savePreset(id?: string) {
    try {
      const saved = await saveSeoMatchPreset({
        data: {
          projectId,
          ...(id ? { id } : {}),
          name: presetName,
          rules,
          isDefault: id
            ? (presets.find((item) => item.id === presetId)?.isDefault ?? false)
            : false,
        },
      });
      const next = await listSeoMatchPresets({ data: { projectId } });
      setPresets(next);
      if (saved) {
        selectPreset(saved);
        if (activeSerp) {
          setReport(
            await getSeoOpportunityReport({
              data: {
                projectId,
                keywordId: activeSerp.keyword.id,
                presetId: saved.id,
              },
            }),
          );
        }
      }
      toast.success(
        "Matching preset saved. Existing SERPs can be rechecked without a provider request.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save matching preset.",
      );
    }
  }

  async function checkOpportunity(keywordId: string) {
    try {
      const selectedPresetId = await saveCurrentPresetIfChanged();
      const next = await getSeoOpportunityReport({
        data: {
          projectId,
          keywordId,
          ...(selectedPresetId ? { presetId: selectedPresetId } : {}),
        },
      });
      setReport(next);
      const saved = await getSavedSeoSerp({ data: { projectId, keywordId } });
      setActiveSerp(saved);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not classify saved search results.",
      );
    }
  }

  async function saveCurrentPresetIfChanged() {
    const selectedPreset = presets.find((item) => item.id === presetId);
    if (
      !selectedPreset ||
      (selectedPreset.name === presetName &&
        JSON.stringify(selectedPreset.rules) === JSON.stringify(rules))
    ) {
      return presetId;
    }
    const saved = await saveSeoMatchPreset({
      data: {
        projectId,
        id: selectedPreset.id,
        name: presetName,
        rules,
        isDefault: selectedPreset.isDefault,
      },
    });
    setPresets(await listSeoMatchPresets({ data: { projectId } }));
    return saved.id;
  }

  function exportKeywordsCsv() {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [
      ["Keyword", "Seed keywords", "Location code", "Language", "Saved at"],
      ...suggestions.map((item) => [
        item.keyword,
        item.seeds.join(" | "),
        String(item.locationCode),
        item.languageCode,
        item.createdAt,
      ]),
    ];
    const csv = rows.map((row) => row.map(escape).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = "seo-keywords.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function exportProjectOpportunitiesCsv() {
    setLoading(true);
    try {
      const selectedPresetId = await saveCurrentPresetIfChanged();
      const opportunities = await getSeoProjectOpportunityExport({
        data: {
          projectId,
          ...(selectedPresetId ? { presetId: selectedPresetId } : {}),
        },
      });
      if (opportunities.length === 0) {
        toast.message("No article opportunities were found in saved SERPs.");
        return;
      }
      const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
      const rows = [
        [
          "Keyword",
          "Seed keywords",
          "Opportunity status",
          "Matching preset",
          "SERP results",
          "SERP status",
          "Matching results",
          "Location code",
          "Language",
          "SERP captured at",
        ],
        ...opportunities.map((item) => [
          item.keyword,
          item.seeds.join(" | "),
          item.status === "candidate"
            ? "Article opportunity"
            : "Potential article opportunity",
          item.presetName,
          String(item.resultCount),
          item.serpStatus,
          String(item.bothCount),
          String(item.locationCode),
          item.languageCode,
          item.capturedAt,
        ]),
      ];
      const link = document.createElement("a");
      link.href = URL.createObjectURL(
        new Blob([rows.map((row) => row.map(escape).join(",")).join("\r\n")], {
          type: "text/csv;charset=utf-8",
        }),
      );
      link.download = "seo-opportunities.csv";
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success(`Exported ${opportunities.length} article opportunities.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not export saved article opportunities.",
      );
    } finally {
      setLoading(false);
    }
  }

  function exportOpportunityCsv() {
    if (!report) return;
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const resultRows = report.results.length
      ? report.results.map((item) => [
          report.keyword.keyword,
          report.status,
          report.preset.name,
          report.snapshot?.status ?? "",
          String(item.rank),
          item.title,
          item.url,
          item.classification,
        ])
      : [
          [
            report.keyword.keyword,
            report.status,
            report.preset.name,
            report.snapshot?.status ?? "",
            "",
            "",
            "",
            "",
          ],
        ];
    const rows = [
      [
        "Keyword",
        "Opportunity status",
        "Matching preset",
        "SERP status",
        "Rank",
        "Title",
        "URL",
        "Match",
      ],
      ...resultRows,
    ];
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([rows.map((row) => row.map(escape).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    link.download = "seo-opportunity.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const languages = getLanguageOptions(locationCode);

  return (
    <div className="space-y-6">
      <PageHeader
        title="SEO Intelligence"
        description="Collect Google suggestions and inspect the first ten organic results for configurable markets."
      />

      <section className="rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Google Autocomplete</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One paid DataForSEO request collects suggestions for one seed. Saved
          suggestions are reused without another request.
        </p>
        <form
          className="mt-4 grid gap-3 md:grid-cols-[minmax(16rem,1fr)_14rem_10rem_auto]"
          onSubmit={prepareAutocomplete}
        >
          <Input
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            placeholder="Enter a seed keyword"
            aria-label="Seed keyword"
            maxLength={700}
          />
          <label className="grid gap-1 text-sm">
            <span>Google location</span>
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={locationCode}
              onChange={(event) => {
                const next = Number(event.target.value);
                setLocationCode(next);
                setLanguageCode(getLanguageCode(next));
              }}
            >
              {LOCATION_OPTIONS.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>Language</span>
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={languageCode}
              onChange={(event) => setLanguageCode(event.target.value)}
            >
              {languages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="submit"
            disabled={loading || !seed.trim()}
            className="self-end"
          >
            {loading ? "Preparing…" : "Collect suggestions"}
          </Button>
        </form>
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <div>
          <h2 className="text-lg font-semibold">Matching rules</h2>
          <p className="text-sm text-muted-foreground">
            Rules are applied to saved SERPs; changing them never makes a
            DataForSEO request.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span>Saved preset</span>
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={presetId}
              onChange={(event) => {
                const preset = presets.find(
                  (item) => item.id === event.target.value,
                );
                if (preset) selectPreset(preset);
              }}
            >
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                  {preset.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>Preset name</span>
            <Input
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              maxLength={80}
            />
          </label>
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              disabled={!presetId}
              onClick={() => void savePreset(presetId)}
            >
              Save changes
            </Button>
            <Button variant="outline" onClick={() => void savePreset()}>
              Save as new
            </Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(["titleIgnoredWords", "urlIgnoredWords"] as const).map((field) => (
            <label key={field} className="grid gap-1 text-sm">
              <span>
                {field === "titleIgnoredWords"
                  ? "Words to ignore in titles"
                  : "Words to ignore in URLs"}{" "}
                (comma separated)
              </span>
              <Input
                value={ignoredWordsDraft[field]}
                onChange={(event) => {
                  const value = event.target.value;
                  setIgnoredWordsDraft((current) => ({
                    ...current,
                    [field]: value,
                  }));
                  setRules((current) => ({
                    ...current,
                    [field]: parseIgnoredWords(value),
                  }));
                }}
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={rules.preserveOrder}
              onChange={(event) =>
                setRules((current) => ({
                  ...current,
                  preserveOrder: event.target.checked,
                }))
              }
            />
            Keep word order
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={rules.adjacentPhrase}
              onChange={(event) =>
                setRules((current) => ({
                  ...current,
                  adjacentPhrase: event.target.checked,
                }))
              }
            />
            Require adjacent phrase
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={rules.urlPathOnly}
              onChange={(event) =>
                setRules((current) => ({
                  ...current,
                  urlPathOnly: event.target.checked,
                }))
              }
            />
            Match URL path only
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={rules.ampersandEqualsAnd}
              onChange={(event) =>
                setRules((current) => ({
                  ...current,
                  ampersandEqualsAnd: event.target.checked,
                }))
              }
            />
            Treat “and” as equivalent to &amp;
          </label>
        </div>
      </section>

      <section className="rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">Saved suggestions</h2>
            <p className="text-sm text-muted-foreground">
              {suggestions.length} unique keyword
              {suggestions.length === 1 ? "" : "s"} saved in this project.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={selected.length === 0 || loading}
            onClick={() => void prepareSerp(selected)}
          >
            Analyze selected (
            {serpMode === "live"
              ? "Live"
              : serpMode === "standard"
                ? "Standard queue"
                : "Priority queue"}
            )
          </Button>
          <Button
            variant="outline"
            disabled={suggestions.length === 0}
            onClick={exportKeywordsCsv}
          >
            Export CSV
          </Button>
          <Button
            variant="outline"
            disabled={suggestions.length === 0 || !presetId || loading}
            onClick={() => void exportProjectOpportunitiesCsv()}
          >
            Export opportunities
          </Button>
        </div>
        <div className="px-4 pb-4">
          <label className="grid max-w-sm gap-1 text-sm">
            <span>SERP collection mode</span>
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={serpMode}
              onChange={(event) =>
                setSerpMode(event.target.value as typeof serpMode)
              }
            >
              <option value="live">Live mode (fastest response)</option>
              <option value="standard">
                Standard queue (lower cost, usually minutes)
              </option>
              <option value="priority">
                Priority queue (faster queue, higher cost)
              </option>
            </select>
          </label>
        </div>
        {suggestions.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Collect a seed to start building your saved keyword list.
          </p>
        ) : (
          <div className="divide-y">
            {suggestions.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-3 p-3"
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${item.keyword}`}
                  checked={selected.includes(item.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id),
                    )
                  }
                />
                <div className="min-w-56 flex-1">
                  <div className="font-medium">{item.keyword}</div>
                  <div className="text-xs text-muted-foreground">
                    From: {item.seeds.join(", ")}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {item.languageCode} · {item.locationCode}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() => void prepareSerp(item.id)}
                >
                  Analyze SERP
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void checkOpportunity(item.id)}
                >
                  Check opportunity
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {apiJobs.length ? (
        <section className="space-y-3 rounded-lg border p-4">
          <div>
            <h2 className="text-lg font-semibold">Recent DataForSEO tasks</h2>
            <p className="text-sm text-muted-foreground">
              Estimates and provider costs are recorded for each approved task.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-2">Task</th>
                  <th className="p-2">Mode</th>
                  <th className="p-2">Requests</th>
                  <th className="p-2">Estimate</th>
                  <th className="p-2">Recorded cost</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {apiJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="p-2">{job.endpoint}</td>
                    <td className="p-2">{job.mode}</td>
                    <td className="p-2">{job.requestCount}</td>
                    <td className="p-2">{money(job.estimateUsd)}</td>
                    <td className="p-2">
                      {job.actualUsd === null ? "—" : money(job.actualUsd)}
                    </td>
                    <td className="p-2 capitalize">{job.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeSerp ? (
        <section className="rounded-lg border">
          <div className="border-b p-4">
            <h2 className="text-lg font-semibold">
              Top organic results for “{activeSerp.keyword.keyword}”
            </h2>
            <p className="text-sm text-muted-foreground">
              {activeSerp.snapshot?.resultCount ??
                activeSerp.snapshot?.results.length ??
                0}{" "}
              valid organic results · {activeSerp.snapshot?.status ?? "saved"}
            </p>
            <Button
              className="mt-2"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void prepareSerp(activeSerp.keyword.id, true)}
            >
              Refresh SERP
            </Button>
          </div>
          {activeSerp.snapshot?.results.length ? (
            <ol className="divide-y">
              {activeSerp.snapshot.results.map((result) => (
                <li
                  key={result.id}
                  className="grid gap-1 p-3 md:grid-cols-[3rem_1fr]"
                >
                  <span className="font-medium">#{result.rank}</span>
                  <div className="min-w-0">
                    <div>{result.title || "(No title returned)"}</div>
                    <a
                      className="break-all text-sm text-primary underline"
                      href={result.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {result.url || "(No URL returned)"}
                    </a>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              No organic results were returned.
            </p>
          )}
        </section>
      ) : null}

      {report ? (
        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">
                Opportunity assessment: “{report.keyword.keyword}”
              </h2>
              <p className="text-sm text-muted-foreground">
                Preset: {report.preset.name} ·{" "}
                {report.status === "candidate"
                  ? "Article opportunity: yes"
                  : report.status === "not_candidate"
                    ? "Article opportunity: no"
                    : report.status === "potential_candidate"
                      ? `Potential article opportunity: yes (${report.snapshot?.resultCount ?? 0}/10 organic results; SERP incomplete)`
                      : "No saved SERP yet"}
              </p>
              {report.snapshot ? (
                <p className="text-xs text-muted-foreground">
                  {report.bothCount ?? 0} results match in both title and URL ·{" "}
                  {report.titleOnlyCount ?? 0} title only ·{" "}
                  {report.urlOnlyCount ?? 0} URL only ·{" "}
                  {report.neitherCount ?? 0} neither
                </p>
              ) : null}
            </div>
            <Button variant="outline" size="sm" onClick={exportOpportunityCsv}>
              Export assessment CSV
            </Button>
          </div>
          {report.results.length ? (
            <ol className="divide-y rounded-md border">
              {report.results.map((result) => (
                <li
                  key={result.id}
                  className="grid gap-1 p-3 md:grid-cols-[3rem_8rem_1fr_auto]"
                >
                  <span>#{result.rank}</span>
                  <strong>{result.classification.replaceAll("_", " ")}</strong>
                  <span className="min-w-0">
                    {result.title}
                    <br />
                    <a
                      className="break-all text-xs text-primary underline"
                      href={result.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {result.url}
                    </a>
                  </span>
                  <Link
                    className="text-sm text-primary underline"
                    to="/p/$projectId/backlinks"
                    params={{ projectId }}
                    search={{ target: result.url, scope: "exact_url" }}
                  >
                    Explore backlinks
                  </Link>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      {approval ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="presentation"
        >
          <section
            className="w-full max-w-lg space-y-4 rounded-lg bg-background p-5 shadow-xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="seo-approval-title"
          >
            <div>
              <h2 id="seo-approval-title" className="text-lg font-semibold">
                Confirm paid DataForSEO request
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {approval.type === "autocomplete"
                  ? `Google Autocomplete suggestions for “${approval.seed}”`
                  : `${approval.jobs.length} Google Organic SERP(s) in ${serpModeLabel(approval.mode)}`}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 text-sm">
              <dt>Requests</dt>
              <dd className="text-right">
                {approval.type === "serp" ? approval.jobs.length : 1}
              </dd>
              <dt>Mode</dt>
              <dd className="text-right">
                {approval.type === "serp"
                  ? serpModeLabel(approval.mode)
                  : "Live"}
              </dd>
              <dt>Estimated charge</dt>
              <dd className="text-right font-semibold">
                {money(approval.estimateUsd)}
              </dd>
              <dt>Maximum approved for this task</dt>
              <dd className="text-right">
                <Input
                  aria-label="Maximum approved DataForSEO charge"
                  type="number"
                  min={approval.estimateUsd}
                  max={1000}
                  step="0.0001"
                  className="ml-auto w-36 text-right"
                  value={approval.capUsd}
                  onChange={(event) =>
                    setApproval((current) =>
                      current
                        ? { ...current, capUsd: Number(event.target.value) }
                        : null,
                    )
                  }
                />
              </dd>
            </dl>
            <p className="text-xs text-muted-foreground">
              This is an estimate, not a guaranteed invoice. Cancel makes no new
              request. A provider charge already incurred cannot be reversed.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => void cancelApproval()}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  loading ||
                  approval.capUsd < approval.estimateUsd ||
                  approval.capUsd > 1000
                }
                onClick={() => void confirmApproval()}
              >
                {loading ? "Working…" : "Confirm and run"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
