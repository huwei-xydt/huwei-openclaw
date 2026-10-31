import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { createControlUiE2eArtifactDir } from "../test-helpers/control-ui-e2e-artifacts.ts";
import { takeControlUiViewportScreenshot } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const suite = createControlUiE2eSuite({
  name: "Control UI logs NFC filter",
  startServerBeforeBrowser: true,
  unavailableMessage: (executablePath) => `Playwright Chromium is unavailable at ${executablePath}`,
});

/** Decomposed diaeresis (M + U+0308 + uchen) forces a real Unicode mismatch without NFC. */
const NFD_NEEDLE = "münchen-notes".normalize("NFD");
const NFC_QUERY = "münchen-notes".normalize("NFC");

function tailLine(message: string) {
  return JSON.stringify({
    time: new Date(1_800_000_000_000).toISOString(),
    level: "info",
    subsystem: "nfc-filter-e2e",
    message,
  });
}

suite.define(() => {
  it("matches NFC and NFD log filters against NFD log lines", async () => {
    const artifactDir = process.env.OPENCLAW_UI_E2E_ARTIFACT_DIR?.trim()
      ? createControlUiE2eArtifactDir("logs-filter-nfc")
      : undefined;
    const viewport = { width: 1280, height: 900 };
    await suite.withPage({ viewport, serviceWorkers: "block" }, async ({ page }) => {
      await installMockGateway(page, {
        methodResponses: {
          "logs.tail": {
            cursor: 2,
            file: "/tmp/openclaw/nfc-filter.log",
            lines: [tailLine(`${NFD_NEEDLE} opened`), tailLine("home-notes ready")],
            reset: true,
          },
        },
      });

      await page.goto(`${suite.server.baseUrl}logs`);
      const rows = page.locator(".log-row");
      await rows.first().waitFor({ state: "visible" });
      await expect.poll(() => rows.count()).toBe(2);

      const filter = page.locator('.logs-card input[aria-label="Filter"]');
      await filter.waitFor();
      const pageSurface = page.locator(".logs-card");
      const screenshot = async (name: string) => {
        if (artifactDir) {
          await writeFile(
            path.join(artifactDir, name),
            await takeControlUiViewportScreenshot(page, pageSurface, [filter]),
          );
        }
      };

      await screenshot("logs-unfiltered.png");

      const setFilter = async (value: string) => {
        await filter.click();
        // Controlled Solid input: type through the keyboard so onInput sees real keys.
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.press("Delete");
        if (value) {
          await page.keyboard.type(value, { delay: 25 });
        }
        await expect.poll(() => filter.inputValue()).toBe(value);
      };

      await setFilter(NFC_QUERY);
      await screenshot("logs-nfc-query-nfd-line.png");
      await expect.poll(() => rows.count()).toBe(1);
      await expect.poll(() => pageSurface.textContent()).toContain(NFD_NEEDLE);
      await expect.poll(() => pageSurface.textContent()).not.toContain("home-notes");

      await setFilter(NFD_NEEDLE);
      await screenshot("logs-nfd-query-nfd-line.png");
      await expect.poll(() => rows.count()).toBe(1);
      await expect.poll(() => pageSurface.textContent()).toContain(NFD_NEEDLE);

      await setFilter("");
      await screenshot("logs-filter-cleared.png");
      await expect.poll(() => rows.count()).toBe(2);
    });
  });
});
