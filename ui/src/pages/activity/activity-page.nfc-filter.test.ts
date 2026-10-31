/* @vitest-environment jsdom */

import { expect, it, vi } from "vitest";
import { createGatewayStoreTestStore } from "../../app/gateway-store.test-support.ts";
import { i18n } from "../../i18n/index.ts";
import { createAgentIdentityCapability } from "../../lib/agents/identity.ts";
import { createAgentCapability } from "../../lib/agents/index.ts";
import { setAvatarGatewayOrigin } from "../../lib/identity-avatar-context.ts";
import { createTestSessionCapability } from "../../lib/sessions/session-capability.test-support.ts";
import { cleanupSolid } from "../../test-helpers/mount-solid.ts";
import { flush, waitForSolid } from "../../test-helpers/solid-settle.ts";
import {
  activityHello,
  activityResponse,
  activityRoster,
  activitySettings,
  createActivityContext,
  createActivityPage,
  toolEvent,
} from "./activity-page.test-support.ts";

it("matches live activity search across NFC and NFD tool output text", async () => {
  await i18n.setLocale("en");
  const { gateway: source, current } = createGatewayStoreTestStore({
    settings: activitySettings(),
  });
  const sessions = createTestSessionCapability(source);
  const agents = createAgentCapability(source);
  const agentIdentity = createAgentIdentityCapability(source);
  try {
    source.start();
    current().request.mockImplementation(async (method, params) =>
      method === "sessions.list" ? activityRoster() : activityResponse(method, params),
    );
    current().testOptions.onHello?.(activityHello());
    const page = createActivityPage(
      createActivityContext(source, { sessions, agents, agentIdentity }, "/control"),
      { pathname: "/control/activity", search: "?view=live", hash: "" },
    );
    await waitForSolid(() =>
      expect(page.container.querySelectorAll(".activity-current-work__row").length).toBeGreaterThan(
        0,
      ),
    );
    const NFD_ID = "münchen-notes".normalize("NFD");
    current().testOptions.onEvent?.(toolEvent(NFD_ID, "main", "read"));
    current().testOptions.onEvent?.(toolEvent("home-notes", "main", "exec"));
    await waitForSolid(() =>
      expect(page.container.querySelectorAll(".activity-entry")).toHaveLength(2),
    );
    const search = page.container.querySelector<HTMLInputElement>(
      '.activity-live-toolbar input[type="search"]',
    );
    expect(search).not.toBeNull();
    search!.value = "münchen-notes".normalize("NFC");
    search!.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    expect(page.container.querySelectorAll(".activity-entry")).toHaveLength(1);
    expect(page.container.textContent).toContain(NFD_ID);
    search!.value = "münchen-notes".normalize("NFD");
    search!.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    expect(page.container.querySelectorAll(".activity-entry")).toHaveLength(1);
    search!.value = "";
    search!.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    expect(page.container.querySelectorAll(".activity-entry")).toHaveLength(2);
    page.dispose();
  } finally {
    cleanupSolid();
    sessions.dispose();
    agents.dispose();
    source.stop();
    await vi.dynamicImportSettled();
    setAvatarGatewayOrigin(null);
    localStorage.clear();
    sessionStorage.clear();
  }
});
