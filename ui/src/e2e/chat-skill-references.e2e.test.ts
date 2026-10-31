import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locator } from "playwright";
import { expect, it } from "vitest";
import { createControlUiE2eArtifactDir } from "../test-helpers/control-ui-e2e-artifacts.ts";
import { takeControlUiViewportScreenshot } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const suite = createControlUiE2eSuite({ name: "Control UI skill references" });
const command = (name: string, skillDisplayName?: string) => ({
  acceptsArgs: Boolean(skillDisplayName),
  description: name,
  name,
  scope: "both",
  source: skillDisplayName ? "skill" : "native",
  ...(skillDisplayName ? { skillDisplayName, skillModelVisible: true } : {}),
});

/** NFD title (M + combining diaeresis + uchen) vs ASCII command token. */
const NFD_TITLE = "München";
const NFC_TITLE = NFD_TITLE.normalize("NFC");

suite.define(() => {
  it("references multiple skills inside a normal prompt and sends their raw names", async () => {
    const artifactDir = process.env.OPENCLAW_UI_E2E_ARTIFACT_DIR?.trim()
      ? createControlUiE2eArtifactDir("chat-skill-references")
      : undefined;
    const viewport = { width: 1280, height: 900 };
    await suite.withPage(
      {
        viewport,
      },
      async ({ page }) => {
        const commands = [
          command("autoreview", "Auto Review"),
          command("technical_documentation", "Technical Documentation"),
          command("status_report", "Status Report"),
          command("status"),
        ];
        const gateway = await installMockGateway(page, {
          deferredMethods: ["chat.send"],
          methodResponses: {
            "chat.startup": {
              messages: [],
              metadata: { commands, models: [] },
              sessionId: "skill-reference-session",
              thinkingLevel: null,
            },
            "commands.list": { commands },
          },
        });

        await page.goto(`${suite.server.baseUrl}chat`);
        await gateway.waitForRequest("sessions.messages.subscribe");
        const composer = page.locator(".agent-chat__composer-combobox textarea");
        const draft = (value: string) => expect.poll(() => composer.inputValue()).toBe(value);
        const screenshot = async (name: string, target: Locator) => {
          if (artifactDir) {
            await writeFile(
              path.join(artifactDir, name),
              await takeControlUiViewportScreenshot(page, page.locator(".shell"), [target]),
            );
          }
        };
        await composer.fill("Review this with $auto");

        const picker = page.getByRole("listbox", { name: "Skill references" });
        await picker.waitFor({ state: "visible" });
        await expect
          .poll(() => picker.getByRole("option").allTextContents())
          .toEqual([expect.stringContaining("Auto Review")]);
        await screenshot("skill-reference-picker.png", picker);
        await composer.press("Enter");
        await draft("Review this with $autoreview ");

        await composer.fill(`${await composer.inputValue()}and $technical`);
        await expect.poll(() => picker.getByRole("option").count()).toBe(1);
        await composer.press("Tab");
        await draft("Review this with $autoreview and $technical_documentation ");
        await screenshot("skill-references-selected.png", composer);

        await page.getByRole("button", { name: "Send message" }).click();
        const request = await gateway.waitForRequest("chat.send");
        expect(request.params).toMatchObject({
          message: "Review this with $autoreview and $technical_documentation",
        });

        await composer.fill("Print $HOME");
        await expect.poll(() => picker.count()).toBe(0);
        await composer.fill("Review this with /auto");
        const slashPicker = page.getByRole("listbox", { name: "Slash commands" });
        await slashPicker.waitFor({ state: "visible" });
        await expect.poll(() => slashPicker.getByRole("option").count()).toBe(1);
        await composer.press("Enter");
        await draft("Review this with $autoreview ");

        await composer.fill("/");
        await slashPicker.waitFor({ state: "visible" });
        await expect.poll(() => page.getByRole("option", { name: /\/status/u }).count()).toBe(2);

        const slashOptions = slashPicker.getByRole("option");
        await composer.fill("/sta");
        await expect
          .poll(async () => {
            const names = await slashOptions.locator(".slash-menu-name").allTextContents();
            return { first: names[0], last: names.at(-1) };
          })
          .toEqual({ first: "/status", last: "/status_report" });
        await composer.press("Tab");
        await draft("/status");
      },
    );
  });

  it("matches skill $refs across NFC query and NFD display titles and keeps $HOME literal", async () => {
    const artifactDir = process.env.OPENCLAW_UI_E2E_ARTIFACT_DIR?.trim()
      ? createControlUiE2eArtifactDir("chat-skill-references-nfc")
      : undefined;
    const viewport = { width: 1280, height: 900 };
    await suite.withPage(
      {
        viewport,
      },
      async ({ page }) => {
        const commands = [command("munchen_notes", NFD_TITLE), command("home_notes", "Home Notes")];
        const gateway = await installMockGateway(page, {
          methodResponses: {
            "chat.startup": {
              messages: [],
              metadata: { commands, models: [] },
              sessionId: "skill-reference-nfc-session",
              thinkingLevel: null,
            },
            "commands.list": { commands },
          },
        });

        await page.goto(`${suite.server.baseUrl}chat`);
        await gateway.waitForRequest("sessions.messages.subscribe");
        const composer = page.locator(".agent-chat__composer-combobox textarea");
        const draft = (value: string) => expect.poll(() => composer.inputValue()).toBe(value);
        const picker = page.getByRole("listbox", { name: "Skill references" });
        const screenshot = async (name: string, target: Locator) => {
          if (artifactDir) {
            await writeFile(
              path.join(artifactDir, name),
              await takeControlUiViewportScreenshot(page, page.locator(".shell"), [target]),
            );
          }
        };

        // NFC query against NFD title: menu must show the NFD title and insert the ASCII token.
        await composer.fill(`Open $${"münchen".normalize("NFC")}`);
        await picker.waitFor({ state: "visible" });
        await expect
          .poll(() => picker.getByRole("option").allTextContents())
          .toEqual([expect.stringContaining(NFD_TITLE)]);
        await screenshot("nfc-query-nfd-title-picker.png", picker);
        await composer.press("Enter");
        await draft("Open $munchen_notes ");
        await screenshot("nfc-query-inserted.png", composer);

        // NFD query against NFC-comparable title.
        await composer.fill(`Open $${"münchen".normalize("NFD")}`);
        await picker.waitFor({ state: "visible" });
        await expect
          .poll(() => picker.getByRole("option").allTextContents())
          .toEqual([expect.stringContaining(NFD_TITLE)]);
        await composer.press("Enter");
        await draft("Open $munchen_notes ");

        // Documented shell variable stays ordinary text while skill completions exist.
        await composer.fill("Print $HOME");
        await expect.poll(() => picker.count()).toBe(0);
        await draft("Print $HOME");
      },
    );
  });
});
