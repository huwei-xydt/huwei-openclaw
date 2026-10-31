/* @vitest-environment jsdom */

import { flush } from "solid-js";
import { expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { mountSolid } from "../../test-helpers/mount-solid.ts";
import { installLogsViewport } from "./logs-layout.test-support.ts";
import { LogsView, type LogsProps } from "./view.tsx";

/** Decomposed diaeresis (M + U+0308 + uchen) forces a real Unicode mismatch without NFC. */
const NFD_LINE = "münchen-notes opened".normalize("NFD");
const NFC_NEEDLE = "münchen-notes".normalize("NFC");
const NFD_NEEDLE = "münchen-notes".normalize("NFD");

function createProps(overrides: Partial<LogsProps> = {}): LogsProps {
  return {
    completion: null,
    refreshDisabled: false,
    status: { error: null, hasLoaded: true, stale: false, awaitingGateway: false },
    file: null,
    entries: [
      { id: 0, raw: NFD_LINE, level: "info" as const, message: NFD_LINE },
      { id: 1, raw: "home-notes ready", level: "info" as const, message: "home-notes ready" },
    ],
    filterText: "",
    levelFilters: { trace: true, debug: true, info: true, warn: true, error: true, fatal: true },
    autoFollow: true,
    truncated: false,
    onFilterTextChange: vi.fn(),
    onLevelToggle: vi.fn(),
    onToggleAutoFollow: vi.fn(),
    onRefresh: vi.fn(),
    onExport: vi.fn(),
    onStreamRef: (element) => {
      element.scrollTo = () => undefined;
    },
    ...overrides,
  };
}

it("matches NFC and NFD log filters against NFD log text", async () => {
  await i18n.setLocale("en");
  installLogsViewport(document.createElement("div"));
  const messages = () =>
    Array.from(document.querySelectorAll(".log-message"), (node) => node.textContent ?? "");
  const view = mountSolid(() => <LogsView {...createProps({ filterText: NFC_NEEDLE })} />);
  flush();
  expect(messages().some((text) => text.includes(NFD_LINE))).toBe(true);
  expect(messages().some((text) => text.includes("home-notes"))).toBe(false);
  view.unmount();

  const reverse = mountSolid(() => <LogsView {...createProps({ filterText: NFD_NEEDLE })} />);
  flush();
  expect(messages().some((text) => text.includes(NFD_LINE))).toBe(true);
  expect(messages().some((text) => text.includes("home-notes"))).toBe(false);
  reverse.unmount();
});
