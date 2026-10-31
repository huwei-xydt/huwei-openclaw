// @vitest-environment node
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildFallbackSlashCommands,
  replaceSlashCommands,
  type SlashCommandDef,
} from "../../../lib/chat/commands.ts";
import { createSkillMenu, type SkillMenuHost } from "./chat-composer-skill-menu-state.ts";

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

function updateAndRead(
  menu: ReturnType<typeof createSkillMenu>,
  draft: string,
  caret: number,
): { open: boolean; names: string[] } {
  const open = menu.update(draft, caret, hostWith(draft));
  flush();
  return { open, names: [...menu.state.skillMenuItems].map((item) => item.name) };
}

describe("skill mention tokenizer", () => {
  it("keeps non-ASCII display-title queries open so completions can match NFC titles", () => {
    replaceSlashCommands([skill("munchen_notes", "München")]);
    const menu = createSkillMenu();
    for (const draft of ["$MÜNCHEN", "$MÜNCHEN".normalize("NFD"), "$münchen"]) {
      expect(updateAndRead(menu, draft, draft.length), draft).toEqual({
        open: true,
        names: ["munchen_notes"],
      });
    }
  });

  it("still ignores digit-only mentions while allowing bare dollars to list skills", () => {
    replaceSlashCommands([skill("release_notes", "Release Notes")]);
    const menu = createSkillMenu();
    expect(updateAndRead(menu, "cost $123 now", 8).open).toBe(false);
    // Empty query after $ intentionally lists every visible skill.
    expect(updateAndRead(menu, "just $", 6)).toEqual({
      open: true,
      names: ["release_notes"],
    });
  });

  it("still opens ASCII skill mentions", () => {
    replaceSlashCommands([skill("release_notes", "Release Notes")]);
    const menu = createSkillMenu();
    expect(updateAndRead(menu, "$release", "$release".length)).toEqual({
      open: true,
      names: ["release_notes"],
    });
  });

  it("keeps uppercase ASCII shell variables literal even when a matching skill is loaded", () => {
    replaceSlashCommands([skill("home_notes", "Home Notes")]);
    const menu = createSkillMenu();
    for (const draft of ["Print $HOME", "$PATH", "$EDITOR"]) {
      expect(updateAndRead(menu, draft, draft.length), draft).toEqual({
        open: false,
        names: [],
      });
    }
    // Lowercase skill references still open and can select the command token.
    expect(updateAndRead(menu, "$home", "$home".length)).toEqual({
      open: true,
      names: ["home_notes"],
    });
  });
});
