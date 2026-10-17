export type MatchClassification = "both" | "title_only" | "url_only" | "neither";

export type MatchRules = {
  titleIgnoredWords: string[];
  urlIgnoredWords: string[];
  preserveOrder: boolean;
  adjacentPhrase: boolean;
  urlPathOnly: boolean;
  ampersandEqualsAnd: boolean;
};

export const FLEXIBLE_MATCH_RULES: MatchRules = {
  titleIgnoredWords: [],
  urlIgnoredWords: ["a", "an", "the", "and"],
  preserveOrder: false,
  adjacentPhrase: false,
  urlPathOnly: true,
  ampersandEqualsAnd: true,
};

export const STRICT_MATCH_RULES: MatchRules = {
  ...FLEXIBLE_MATCH_RULES,
  urlIgnoredWords: [],
  ampersandEqualsAnd: false,
};

function normalizeText(value: string, rules: MatchRules): string[] {
  let text = value.normalize("NFKC").toLocaleLowerCase();
  if (rules.ampersandEqualsAnd) text = text.replace(/&/g, " and ");
  try {
    text = decodeURIComponent(text.replace(/\+/g, "%2B"));
  } catch {
    // Malformed URL escapes remain literal punctuation and are tokenized below.
  }
  return text.match(/[\p{L}\p{N}]+/gu) ?? [];
}

function urlText(url: string, pathOnly: boolean): string {
  if (!pathOnly) return url;
  try {
    return new URL(url).pathname;
  } catch {
    return url.split(/[?#]/, 1)[0] ?? url;
  }
}

function matches(
  keyword: string,
  text: string,
  ignoredWords: string[],
  rules: MatchRules,
): boolean {
  const ignored = new Set(ignoredWords.map((word) => word.toLocaleLowerCase()));
  const required = normalizeText(keyword, rules).filter(
    (word) => !ignored.has(word),
  );
  const tokens = normalizeText(text, rules);
  if (required.length === 0) return false;

  if (rules.adjacentPhrase) {
    return tokens.some((_, start) =>
      required.every((word, offset) => tokens[start + offset] === word),
    );
  }

  if (rules.preserveOrder) {
    let next = 0;
    for (const token of tokens) {
      if (token === required[next]) next++;
      if (next === required.length) return true;
    }
    return false;
  }

  const available = new Set(tokens);
  return required.every((word) => available.has(word));
}

export function classifyOrganicResult(
  keyword: string,
  title: string,
  url: string,
  rules: MatchRules,
): MatchClassification {
  const titleMatch = matches(keyword, title, rules.titleIgnoredWords, rules);
  const urlMatch = matches(
    keyword,
    urlText(url, rules.urlPathOnly),
    rules.urlIgnoredWords,
    rules,
  );
  if (titleMatch && urlMatch) return "both";
  if (titleMatch) return "title_only";
  if (urlMatch) return "url_only";
  return "neither";
}

export function classifyOpportunity(
  classifications: MatchClassification[],
  validOrganicResultCount: number,
) {
  if (classifications.includes("both")) return "not_candidate" as const;
  if (validOrganicResultCount === 10 && classifications.length === 10) {
    return "candidate" as const;
  }
  return "potential_candidate" as const;
}
