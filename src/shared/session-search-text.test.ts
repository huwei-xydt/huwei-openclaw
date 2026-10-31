// @vitest-environment node
import { describe, expect, it } from "vitest";
import { foldSearchSigma, normalizeSessionSearchText } from "./session-search-text.ts";

describe("foldSearchSigma", () => {
  it("folds final sigma so capital/medial queries match lowercased titles", () => {
    expect(normalizeSessionSearchText("ΕΛΕΓΧΟΣ")).toBe(normalizeSessionSearchText("ελεγχος"));
    expect(normalizeSessionSearchText("ΕΛΕΓΧΟΣ").includes(normalizeSessionSearchText("Σ"))).toBe(
      true,
    );
    expect(normalizeSessionSearchText("ΕΛΕΓΧΟΣ").includes(normalizeSessionSearchText("σ"))).toBe(
      true,
    );
    expect(normalizeSessionSearchText("ΕΛΕΓΧΟΣ").includes(normalizeSessionSearchText("ς"))).toBe(
      true,
    );
    expect(foldSearchSigma("ς")).toBe("σ");
    expect(foldSearchSigma("Μünchen")).toBe("Μünchen");
  });
});
