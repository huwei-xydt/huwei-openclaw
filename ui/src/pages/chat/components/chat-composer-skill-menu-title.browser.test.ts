import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildFallbackSlashCommands,
  replaceSlashCommands,
  type SlashCommandDef,
} from "../../../lib/chat/commands.ts";
import { mountSolid } from "../../../test-helpers/solid-render.tsx";
import { waitForSolid } from "../../../test-helpers/solid-settle.ts";
import { SkillMenuOptions } from "./chat-composer-skill-menu-options.tsx";
import { createSkillMenu, type SkillMenuHost } from "./chat-composer-skill-menu-state.ts";

const NFD_TITLE = "München".normalize("NFD");
const NFC_TITLE = "München".normalize("NFC");

function skill(name: string, skillDisplayName?: string): SlashCommandDef {
  return {
    key: name,
    name,
    description: name,
    source: "skill",
    skillModelVisible: true,
    ...(skillDisplayName ? { skillDisplayName } : {}),
  };
}

function hostWith(draft: string): SkillMenuHost {
  return {
    paneId: "pane",
    getDraft: () => draft,
    commitDraft: () => undefined,
    getTextarea: () => null,
  };
}

afterEach(() => {
  flush();
  replaceSlashCommands(buildFallbackSlashCommands());
});

function mountOptions(menu: ReturnType<typeof createSkillMenu>, draft: string) {
  const commits: string[] = [];
  const host: SkillMenuHost = {
    paneId: "pane",
    getDraft: () => draft,
    commitDraft: (next) => {
      commits.push(next);
    },
    getTextarea: () => null,
  };
  menu.update(draft, draft.length, host);
  flush();
  const view = mountSolid(SkillMenuOptions, { menu, host });
  return {
    ...view,
    commits,
    host,
    text: () => (view.container.textContent ?? "").normalize("NFC"),
  };
}

describe("skill menu browser title proof", () => {
  it("shows an NFD display title for an NFC query and inserts the stable command token", async () => {
    replaceSlashCommands([skill("munchen_notes", NFD_TITLE)]);
    const menu = createSkillMenu();
    const draft = "$münchen".normalize("NFC");
    const view = mountOptions(menu, draft);
    await waitForSolid(() => {
      expect(view.text()).toContain(NFC_TITLE);
      expect(view.text()).toContain("munchen_notes");
    });
    menu.select(menu.state.skillMenuItems[0]!, view.host);
    await waitForSolid(() => {
      expect(view.commits.at(-1)?.normalize("NFC")).toMatch(/^\$munchen_notes/);
    });
  });

  it("shows an NFC display title for an NFD query", async () => {
    replaceSlashCommands([skill("munchen_notes", NFC_TITLE)]);
    const menu = createSkillMenu();
    const draft = "$münchen".normalize("NFD");
    const view = mountOptions(menu, draft);
    await waitForSolid(() => {
      expect(view.text()).toContain(NFC_TITLE);
      expect(view.text()).toContain("munchen_notes");
    });
  });

  it("keeps uppercase shell variables out of the skill menu in the DOM", () => {
    replaceSlashCommands([skill("home_notes", "Home Notes")]);
    const menu = createSkillMenu();
    for (const draft of ["Print $HOME", "$PATH", "$EDITOR"]) {
      expect(menu.update(draft, draft.length, hostWith(draft)), draft).toBe(false);
      flush();
    }
    expect(menu.update("$home", "$home".length, hostWith("$home"))).toBe(true);
  });
});
