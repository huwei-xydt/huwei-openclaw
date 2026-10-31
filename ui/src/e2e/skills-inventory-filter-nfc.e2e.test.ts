import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locator } from "playwright";
import { expect, it } from "vitest";
import { sourceConfigSnapshot } from "../lib/config/config-snapshot.test-support.ts";
import { createSkill } from "../pages/skills/view.test-support.ts";
import { createControlUiE2eArtifactDir } from "../test-helpers/control-ui-e2e-artifacts.ts";
import { takeControlUiViewportScreenshot } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { agentRoster as createAgentRoster } from "./agent-roster.test-support.ts";
import {
  createControlUiE2eContextOptions,
  createControlUiE2eSuite,
} from "./control-ui-e2e-suite.test-support.ts";

const suite = createControlUiE2eSuite({
  name: "Control UI skills inventory NFC filter",
  startServerBeforeBrowser: true,
  unavailableMessage: (executablePath) => `Playwright Chromium is unavailable at ${executablePath}`,
});

const agentRoster = createAgentRoster({ main: "Main agent" }, "main", "agent");
/** Decomposed diaeresis (M + U+0308 + uchen) forces a real Unicode mismatch without NFC. */
const NFD_NAME = "München notes".normalize("NFD");

suite.define(() => {
  it("matches NFC and NFD filter queries on the built Settings Skills inventory", async () => {
    const artifactDir = process.env.OPENCLAW_UI_E2E_ARTIFACT_DIR?.trim()
      ? createControlUiE2eArtifactDir("skills-inventory-filter-nfc")
      : undefined;
    const viewport = { width: 1280, height: 900 };
    await suite.withPage({ ...createControlUiE2eContextOptions(), viewport }, async ({ page }) => {
      const config = { agents: { entries: { main: {} } } };
      const skills = [
        createSkill({
          name: NFD_NAME,
          description: "Munich notes skill",
          source: "openclaw-managed",
          skillKey: "munchen-notes",
        }),
        createSkill({
          name: "Home notes",
          description: "Home notes skill",
          source: "openclaw-managed",
          skillKey: "home-notes",
        }),
      ];
      const gateway = await installMockGateway(page, {
        assistantName: "Main agent",
        defaultAgentId: "main",
        methodResponses: {
          "agents.list": agentRoster,
          "config.get": {
            ...sourceConfigSnapshot(config, "agent-config-hash-1"),
            runtimeConfig: config,
          },
          "skills.status": {
            agentId: "main",
            agentSkillFilter: [],
            workspaceDir: "/tmp/workspace",
            managedSkillsDir: "/tmp/skills",
            skills,
          },
        },
      });

      const response = await page.goto(`${suite.server.baseUrl}settings/skills?agent=main`);
      expect(response?.status()).toBe(200);
      await gateway.waitForRequest("config.get");
      await gateway.waitForRequest("skills.status");

      const pageSurface = page.locator("openclaw-settings-page, openclaw-skills-page").first();
      const filter = page.locator('input[name="skills-filter"]');
      await filter.waitFor();
      const screenshot = async (name: string, target: Locator) => {
        if (artifactDir) {
          await writeFile(
            path.join(artifactDir, name),
            await takeControlUiViewportScreenshot(page, pageSurface, [target]),
          );
        }
      };
      const expectShown = async (count: 1 | 2, title: string | null) => {
        await expect
          .poll(async () => {
            const text = (await pageSurface.textContent()) ?? "";
            const shownOk = new RegExp(`${count}\\s+shown`, "u").test(text);
            const emptyOk = count === 1 ? !text.includes("No skills found") : true;
            const titleOk = title ? text.includes(title) : true;
            return shownOk && emptyOk && titleOk;
          })
          .toBe(true);
      };
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

      // Inventory must settle on the full list before any query.
      await expectShown(2, "Home notes");
      await screenshot("inventory-unfiltered.png", filter);

      // Composed NFC query against a decomposed NFD skill name.
      await setFilter("münchen".normalize("NFC"));
      await expectShown(1, NFD_NAME);
      await screenshot("nfc-query-nfd-skill.png", filter);

      // Reverse: decomposed NFD query still finds the same NFD name.
      await setFilter("münchen".normalize("NFD"));
      await expectShown(1, NFD_NAME);
      await screenshot("nfd-query-nfd-skill.png", filter);

      // Clear restores both rows so a match is not a false empty-state pass.
      await setFilter("");
      await expectShown(2, "Home notes");
      await screenshot("inventory-filter-cleared.png", filter);
    });
  });
});
