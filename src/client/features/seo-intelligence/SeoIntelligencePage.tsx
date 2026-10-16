import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import {
  collectSeoAutocomplete,
  collectSeoSerp,
  getSavedSeoSerp,
  listSeoSuggestions,
  prepareSeoAutocomplete,
  prepareSeoSerp,
} from "@/serverFunctions/seo-intelligence";
import {
  getLanguageCode,
  getLanguageOptions,
  LOCATION_OPTIONS,
} from "@/shared/keyword-locations";

type Suggestion = Awaited<ReturnType<typeof listSeoSuggestions>>[number];
type SavedSerp = Awaited<ReturnType<typeof getSavedSeoSerp>>;
type Approval =
  | { type: "autocomplete"; jobId: string; estimateUsd: number; seed: string }
  | { type: "serp"; jobId: string; estimateUsd: number; keywordId: string };

function money(value: number) {
  return `$${value.toFixed(4)}`;
}

export function SeoIntelligencePage({ projectId }: { projectId: string }) {
  const [seed, setSeed] = useState("");
  const [locationCode, setLocationCode] = useState(2826);
  const [languageCode, setLanguageCode] = useState("en");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [activeSerp, setActiveSerp] = useState<SavedSerp | null>(null);
  const [loading, setLoading] = useState(false);

  const reloadSuggestions = useCallback(async () => {
    const rows = await listSeoSuggestions();
    setSuggestions(rows);
    setSelected((current) => current.filter((id) => rows.some((row) => row.id === id)));
  }, []);

  useEffect(() => {
    void reloadSuggestions().catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Could not load saved keywords.");
    });
  }, [projectId, reloadSuggestions]);

  async function prepareAutocomplete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!seed.trim() || loading) return;
    setLoading(true);
    try {
      const prepared = await prepareSeoAutocomplete({
        data: { seed: seed.trim(), locationCode, languageCode },
      });
      if (prepared.alreadyCollected) {
        await reloadSuggestions();
        toast.message("Suggestions for this seed are already saved; no new API request was made.");
      } else if (prepared.jobId) {
        setApproval({
          type: "autocomplete",
          jobId: prepared.jobId,
          estimateUsd: prepared.estimateUsd,
          seed: seed.trim(),
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare collection.");
    } finally {
      setLoading(false);
    }
  }

  async function prepareSerp(keywordId: string) {
    if (loading) return;
    setLoading(true);
    try {
      const prepared = await prepareSeoSerp({
        data: { keywordId, mode: "live" },
      });
      if (prepared.savedSnapshot) {
        setActiveSerp({
          keyword: prepared.keyword,
          snapshot: prepared.savedSnapshot,
        });
        toast.message("Showing the saved SERP snapshot; no new API request was made.");
      } else if (prepared.jobId) {
        setApproval({
          type: "serp",
          jobId: prepared.jobId,
          estimateUsd: prepared.estimateUsd,
          keywordId,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare SERP analysis.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmApproval() {
    if (!approval || loading) return;
    setLoading(true);
    try {
      if (approval.type === "autocomplete") {
        await collectSeoAutocomplete({
          data: {
            jobId: approval.jobId,
            approvedCapUsd: approval.estimateUsd,
          },
        });
        await reloadSuggestions();
        setSeed("");
        toast.success("Autocomplete suggestions saved.");
      } else {
        const result = await collectSeoSerp({
          data: {
            jobId: approval.jobId,
            approvedCapUsd: approval.estimateUsd,
          },
        });
        setActiveSerp(
          await getSavedSeoSerp({ data: { keywordId: result.keyword.id } }),
        );
        toast.success("SERP results saved.");
      }
      setApproval(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The approved task failed.");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  const languages = getLanguageOptions(locationCode);

  return (
    <div className="space-y-6">
      <PageHeader
        title="SEO Intelligence"
        description="Collect UK Google suggestions and review the first ten organic results."
      />

      <section className="rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Google Autocomplete</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One paid DataForSEO request collects suggestions for one seed. Saved suggestions are reused without another request.
        </p>
        <form className="mt-4 grid gap-3 md:grid-cols-[minmax(16rem,1fr)_14rem_10rem_auto]" onSubmit={prepareAutocomplete}>
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
                <option key={location.code} value={location.code}>{location.label}</option>
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
                <option key={language.code} value={language.code}>{language.label}</option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={loading || !seed.trim()} className="self-end">
            {loading ? "Preparing…" : "Collect suggestions"}
          </Button>
        </form>
      </section>

      <section className="rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">Saved suggestions</h2>
            <p className="text-sm text-muted-foreground">{suggestions.length} unique keyword{suggestions.length === 1 ? "" : "s"} saved in this project.</p>
          </div>
          <Button
            variant="outline"
            disabled={selected.length === 0 || loading}
            onClick={() => void prepareSerp(selected[0]!)}
          >
            Analyze first selected with Live mode{selected.length > 1 ? ` (${selected.length} selected)` : ""}
          </Button>
        </div>
        {suggestions.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Collect a seed to start building your saved keyword list.</p>
        ) : (
          <div className="divide-y">
            {suggestions.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-3 p-3">
                <input
                  type="checkbox"
                  aria-label={`Select ${item.keyword}`}
                  checked={selected.includes(item.id)}
                  onChange={() => toggleSelected(item.id)}
                />
                <div className="min-w-56 flex-1">
                  <div className="font-medium">{item.keyword}</div>
                  <div className="text-xs text-muted-foreground">From: {item.seeds.join(", ")}</div>
                </div>
                <span className="text-xs text-muted-foreground">{item.languageCode} · {item.locationCode}</span>
                <Button variant="outline" size="sm" disabled={loading} onClick={() => void prepareSerp(item.id)}>
                  Analyze SERP
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {activeSerp ? (
        <section className="rounded-lg border">
          <div className="border-b p-4">
            <h2 className="text-lg font-semibold">Top organic results for “{activeSerp.keyword.keyword}”</h2>
            <p className="text-sm text-muted-foreground">
              {activeSerp.snapshot?.resultCount ?? activeSerp.snapshot?.results.length ?? 0} valid organic results · {activeSerp.snapshot?.status ?? "saved"}
            </p>
          </div>
          {activeSerp.snapshot?.results.length ? (
            <ol className="divide-y">
              {activeSerp.snapshot.results.map((result) => (
                <li key={result.id} className="grid gap-1 p-3 md:grid-cols-[3rem_1fr]">
                  <span className="font-medium">#{result.rank}</span>
                  <div className="min-w-0">
                    <div>{result.title || "(No title returned)"}</div>
                    <a className="break-all text-sm text-primary underline" href={result.url} target="_blank" rel="noreferrer">{result.url || "(No URL returned)"}</a>
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="p-4 text-sm text-muted-foreground">No organic results were returned.</p>}
        </section>
      ) : null}

      {approval ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="presentation">
          <section className="w-full max-w-lg space-y-4 rounded-lg bg-background p-5 shadow-xl" role="alertdialog" aria-modal="true" aria-labelledby="seo-approval-title">
            <div>
              <h2 id="seo-approval-title" className="text-lg font-semibold">Confirm paid DataForSEO request</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {approval.type === "autocomplete"
                  ? `Google Autocomplete suggestions for “${approval.seed}”`
                  : "One Google Organic SERP with the first ten results in Live mode"}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 text-sm">
              <dt>Requests</dt><dd className="text-right">1</dd>
              <dt>Mode</dt><dd className="text-right">Live</dd>
              <dt>Estimated charge</dt><dd className="text-right font-semibold">{money(approval.estimateUsd)}</dd>
            </dl>
            <p className="text-xs text-muted-foreground">This is an estimate, not a guaranteed invoice. Cancel makes no new request. A provider charge already incurred cannot be reversed.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={loading} onClick={() => setApproval(null)}>Cancel</Button>
              <Button disabled={loading} onClick={() => void confirmApproval()}>{loading ? "Working…" : "Confirm and run"}</Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
