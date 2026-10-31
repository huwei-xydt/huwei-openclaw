import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locator } from "playwright";
import { expect, it } from "vitest";
import { createControlUiE2eArtifactDir } from "../test-helpers/control-ui-e2e-artifacts.ts";
import { takeControlUiViewportScreenshot } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { installMockGateway, waitForControlUiRoute } from "../test-helpers/control-ui-e2e.ts";
import {
  createControlUiE2eContextOptions,
  createControlUiE2eSuite,
} from "./control-ui-e2e-suite.test-support.ts";

const suite = createControlUiE2eSuite({
  name: "Control UI live activity NFC search",
  startServerBeforeBrowser: true,
  unavailableMessage: (executablePath) => `Playwright Chromium is unavailable at ${executablePath}`,
});

const at = 1_800_000_000_000;
const running = {
  key: "agent:main:main",
  agentId: "main",
  sessionId: "session-main",
  kind: "direct",
  updatedAt: at,
  label: "Review release notes",
  hasActiveRun: true,
  status: "running",
  activeRunIds: ["run-review"],
};
const listing = (sessions: object[]) => ({
  ts: at,
  path: "",
  count: sessions.length,
  totalCount: sessions.length,
  hasMore: false,
  sessions,
  defaults: { model: null, modelProvider: null, contextTokens: null },
});
/** Decomposed diaeresis (M + U+0308 + uchen) forces a real Unicode mismatch without NFC. */
const NFD_ID = "münchen-notes".normalize("NFD");

suite.define(() => {
  it("matches NFC and NFD live search queries on the built Activity feed", async () => {
    const artifactDir = process.env.OPENCLAW_UI_E2E_ARTIFACT_DIR?.trim()
      ? createControlUiE2eArtifactDir("activity-live-search-nfc")
      : undefined;
    const viewport = { width: 1280, height: 900 };
    await suite.withPage({ ...createControlUiE2eContextOptions(), viewport }, async ({ page }) => {
      const gateway = await installMockGateway(page, {
        sessionKey: "agent:main:main",
        sessions: [running],
        methodResponses: { "sessions.list": listing([running]) },
      });

      await page.goto(`${suite.server.baseUrl}activity?view=live`);
      await waitForControlUiRoute(page, { routeId: "activity", search: "?view=live" });
      await gateway.waitForRequest("sessions.list", { match: { activeOnly: true } });

      const pageSurface = page.locator(".shell").first();
      const entries = page.locator(".activity-entry");
      const search = page.locator('.activity-live-toolbar input[type="search"]');
      await search.waitFor();

      const screenshot = async (name: string, target: Locator) => {
        if (artifactDir) {
          await writeFile(
            path.join(artifactDir, name),
            await takeControlUiViewportScreenshot(page, pageSurface, [target]),
          );
        }
      };

      await gateway.emitGatewayEvent("session.tool", {
        stream: "tool",
        runId: "run-review",
        sessionKey: running.key,
        data: {
          phase: "result",
          name: "read",
          toolCallId: NFD_ID,
          result: { text: `${NFD_ID} output` },
        },
      });
      await gateway.emitGatewayEvent("session.tool", {
        stream: "tool",
        runId: "run-review",
        sessionKey: running.key,
        data: {
          phase: "result",
          name: "exec",
          toolCallId: "home-notes",
          result: { text: "home-notes output" },
        },
      });
      await expect.poll(() => entries.count()).toBe(2);
      await screenshot("activity-unfiltered.png", search);

      const setFilter = async (value: string) => {
        await search.click();
        // Controlled Solid input: type through the keyboard so onInput sees real keys.
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.press("Delete");
        if (value) {
          await page.keyboard.type(value, { delay: 25 });
        }
        await expect.poll(() => search.inputValue()).toBe(value);
      };

      await setFilter("münchen-notes".normalize("NFC"));
      await expect.poll(() => entries.count()).toBe(1);
      await expect.poll(() => pageSurface.textContent()).toContain(NFD_ID);
      await screenshot("activity-nfc-query-nfd-tool.png", search);

      await setFilter("münchen-notes".normalize("NFD"));
      await expect.poll(() => entries.count()).toBe(1);
      await expect.poll(() => pageSurface.textContent()).toContain(NFD_ID);
      await screenshot("activity-nfd-query-nfd-tool.png", search);

      await setFilter("");
      await expect.poll(() => entries.count()).toBe(2);
      await screenshot("activity-filter-cleared.png", search);
    });
  });
});
