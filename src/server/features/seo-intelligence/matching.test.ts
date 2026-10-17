import { describe, expect, it } from "vitest";
import {
  classifyOrganicResult,
  classifyOpportunity,
  FLEXIBLE_MATCH_RULES,
  STRICT_MATCH_RULES,
} from "./matching";

describe("SEO opportunity matching", () => {
  it("matches optional URL words and the ampersand brand variant", () => {
    expect(
      classifyOrganicResult(
        "when to buy a new kettle",
        "When to Buy a New Kettle",
        "https://example.com/when-to-buy-new-kettle",
        FLEXIBLE_MATCH_RULES,
      ),
    ).toBe("both");
    expect(
      classifyOrganicResult(
        "best black and decker air conditioner",
        "Best Black & Decker Air Conditioner",
        "https://example.com/best-black-decker-air-conditioner",
        FLEXIBLE_MATCH_RULES,
      ),
    ).toBe("both");
  });

  it("keeps title and URL rules independent and avoids substring matches", () => {
    const rules = {
      ...FLEXIBLE_MATCH_RULES,
      urlIgnoredWords: [],
      titleIgnoredWords: ["best"],
    };
    expect(
      classifyOrganicResult(
        "best kettle",
        "Kettles are popular",
        "https://example.com/best-kettle",
        rules,
      ),
    ).toBe("url_only");
  });

  it("supports strict, ordered, and adjacent phrase rules", () => {
    expect(
      classifyOrganicResult(
        "when to buy a new kettle",
        "When to Buy a New Kettle",
        "https://example.com/when-to-buy-new-kettle",
        STRICT_MATCH_RULES,
      ),
    ).toBe("title_only");

    const ordered = { ...FLEXIBLE_MATCH_RULES, preserveOrder: true };
    expect(
      classifyOrganicResult("red blue", "blue then red", "/red-blue", ordered),
    ).toBe("url_only");

    const adjacent = { ...FLEXIBLE_MATCH_RULES, adjacentPhrase: true };
    expect(
      classifyOrganicResult("red blue", "red then blue", "/red-blue", adjacent),
    ).toBe("url_only");
  });

  it("marks partial no-match SERPs as potential opportunities", () => {
    expect(classifyOpportunity(Array(9).fill("neither"), 9)).toBe(
      "potential_candidate",
    );
    expect(classifyOpportunity([...Array(9).fill("neither"), "both"], 10)).toBe(
      "not_candidate",
    );
    expect(classifyOpportunity(Array(10).fill("neither"), 10)).toBe(
      "candidate",
    );
  });
});
