import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locator } from "playwright";
import { expect, it } from "vitest";
import { createControlUiE2eArtifactDir } from "../test-helpers/control-ui-e2e-artifacts.ts";
import { takeControlUiViewportScreenshot } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { controlUiSessionUrl, installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import {
  createControlUiE2eContextOptions,
  createControlUiE2eSuite,
} from "./control-ui-e2e-suite.test-support.ts";

const suite = createControlUiE2eSuite({
  name: "Control UI chat message NFC search",
  startServerBeforeBrowser: true,
  unavailableMessage: (executablePath) => `Playwright Chromium is unavailable at ${executablePath}`,
});

const sessionKey = "agent:main:chat-search-nfc";
/** Decomposed diaeresis (M + U+0308 + uchen) forces a real Unicode mismatch without NFC. */
const NFD_NEEDLE = "münchen-notes".normalize("NFD");
const NFC_NEEDLE = "münchen-notes".normalize("NFC");

suite.define(() => {
  it("matches NFC and NFD transcript search queries on the built chat feed", async () => {
    const artifactDir = process.env.OPENCLAW_UI_E2E_ARTIFACT_DIR?.trim()
      ? createControlUiE2eArtifactDir("chat-message-search-nfc")
      : undefined;
    const viewport = { width: 1280, height: 900 };
    await suite.withPage({ ...createControlUiE2eContextOptions(), viewport }, async ({ page }) => {
      await installMockGateway(page, {
        sessionKey,
        sessions: [{ key: sessionKey, kind: "direct", sessionId: "chat-search-nfc-session" }],
        historyMessages: [
          { role: "user", content: `please read ${NFD_NEEDLE} now`, timestamp: 1 },
          { role: "assistant", content: "home-notes is ready", timestamp: 2 },
        ],
      });
      await page.goto(controlUiSessionUrl(suite.server.baseUrl, sessionKey));
      const pane = page.locator(".chat-pane-cache__pane--active");
      const messages = pane.locator("[data-message-id]");
      await messages.first().waitFor();
      await expect.poll(() => messages.count(), { timeout: 15_000 }).toBeGreaterThan(0);

      const surface = page.locator(".shell").first();
      const searchInput = pane.locator(".agent-chat__search-bar input");
      const screenshot = async (name: string, target: Locator) => {
        if (artifactDir) {
          await writeFile(
            path.join(artifactDir, name),
            await takeControlUiViewportScreenshot(page, surface, [target]),
          );
        }
      };
      const bodyText = async () => (await pane.textContent()) ?? "";
      const setQuery = async (value: string) => {
        await searchInput.click();
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.press("Delete");
        if (value) {
          await page.keyboard.type(value, { delay: 25 });
        }
        await expect.poll(() => searchInput.inputValue()).toBe(value);
      };

      // Unfiltered transcript shows both rows.
      const transcript = pane.locator(".chat-thread-inner");
      await transcript.waitFor();
      await expect.poll(bodyText).toContain(NFD_NEEDLE);
      await expect.poll(bodyText).toContain("home-notes is ready");
      await screenshot("chat-unfiltered.png", transcript);

      // Shortcut is owned by the chat section; focus the composer first so Ctrl/Cmd+F bubbles.
      const composer = pane.locator(".agent-chat__composer-combobox textarea").first();
      await composer.waitFor();
      await composer.click();
      await page.keyboard.press("ControlOrMeta+f");
      await searchInput.waitFor();
      await screenshot("chat-search-open.png", searchInput);

      // Composed NFC query must keep the decomposed NFD user message.
      await setQuery(NFC_NEEDLE);
      await expect.poll(bodyText).toContain(NFD_NEEDLE);
      expect(await pane.getByText("home-notes is ready", { exact: false }).count()).toBe(0);
      await screenshot("chat-nfc-query-nfd-message.png", searchInput);

      // Reverse: decomposed NFD query still matches the same NFD message.
      await setQuery(NFD_NEEDLE);
      await expect.poll(bodyText).toContain(NFD_NEEDLE);
      await screenshot("chat-nfd-query-nfd-message.png", searchInput);

      // Clear restores the non-matching assistant row (not a false empty-state pass).
      await setQuery("");
      await expect.poll(bodyText).toContain("home-notes is ready");
      await screenshot("chat-search-cleared.png", searchInput);
    });
  });
});
