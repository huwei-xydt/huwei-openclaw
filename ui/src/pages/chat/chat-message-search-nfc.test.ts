import { expect, it } from "vitest";
import { messageMatchesSearchQuery } from "./chat-thread-items.ts";

/** Decomposed diaeresis (M + U+0308 + uchen) forces a real Unicode mismatch without NFC. */
const NFD_NEEDLE = "münchen-notes".normalize("NFD");
const NFC_NEEDLE = "münchen-notes".normalize("NFC");

it("matches NFC and NFD chat search queries against NFD message text", () => {
  const message = {
    role: "user",
    content: `please read ${NFD_NEEDLE} now`,
  };
  expect(messageMatchesSearchQuery(message, NFC_NEEDLE)).toBe(true);
  expect(messageMatchesSearchQuery(message, NFD_NEEDLE)).toBe(true);
  expect(messageMatchesSearchQuery(message, "home-notes")).toBe(false);
  expect(messageMatchesSearchQuery(message, "")).toBe(true);
  expect(messageMatchesSearchQuery(message, "   ")).toBe(true);
});

it("matches NFC and NFD queries against composed ASCII-adjacent text unchanged", () => {
  const message = {
    role: "assistant",
    content: [{ type: "text", text: "Home notes are ready" }],
  };
  expect(messageMatchesSearchQuery(message, "home notes")).toBe(true);
  expect(messageMatchesSearchQuery(message, "HOME NOTES")).toBe(true);
  expect(messageMatchesSearchQuery(message, "missing")).toBe(false);
});
