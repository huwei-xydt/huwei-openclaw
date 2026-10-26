// Control-UI proof: a branch pushed to a fork remote surfaces its PR (#183747).
// Drives the real session PR loader through the subscribe handler with a real checkout.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import { createFixture, sessionKey } from "./control-ui-session-pr-access.test-support.js";
import {
  githubJson,
  pullListItem,
  requestUrl,
  routedFetch,
} from "./control-ui-session-prs.test-support.js";

const execFileAsync = promisify(execFile);
const EVENT = "controlUi.sessionPullRequests.changed";
const branchName = "fix/session-pr-fork-remote";
const PROOF_TIMEOUT_MS = 60_000;

function frames(socket: { send: { mock: { calls: unknown[][] } } }) {
  return socket.send.mock.calls.flatMap(([data]) => {
    const frame: unknown = JSON.parse(String(data));
    return frame && typeof frame === "object" && (frame as { event?: string }).event === EVENT
      ? [frame as { payload: { sessions: Record<string, { pullRequests?: unknown[] }> } }]
      : [];
  });
}

function lastPulls(socket: Parameters<typeof frames>[0], key: string) {
  return frames(socket)
    .toReversed()
    .map((frame) => frame.payload.sessions[key]?.pullRequests)
    .find((pulls) => Array.isArray(pulls));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it(
  "delivers the branch's PR only after the fork remote-tracking ref exists (#183747)",
  async () => {
    await withOpenClawTestState({ scenario: "minimal" }, async () => {
      vi.stubEnv("GH_TOKEN", "");
      vi.stubEnv("GITHUB_TOKEN", "");

      const pull = pullListItem({
        number: 182621,
        title: "camera list fix",
        html_url: "https://github.com/openclaw/openclaw/pull/182621",
        head: { ref: branchName, sha: "b".repeat(40) },
      });
      const seen: string[] = [];
      const provider = vi.fn<typeof fetch>(async (input) => {
        const url = requestUrl(input);
        seen.push(url);
        return routedFetch([
          { match: "head=openclaw%3A", response: () => githubJson([]) },
          { match: "head=huwei-xydt%3A", response: () => githubJson([pull]) },
          { match: "/pulls/", response: () => githubJson(pull) },
          { match: "/check-runs", response: () => githubJson({ total_count: 0, check_runs: [] }) },
          { match: "/repos/openclaw/openclaw", response: () => githubJson({ fork: false }) },
        ])(input);
      });
      vi.stubGlobal("fetch", provider);

      const repoRoot = await fs.realpath(
        await fs.mkdtemp(path.join(os.tmpdir(), "fork-remote-proof-")),
      );
      const git = (...args: string[]) =>
        execFileAsync(
          "git",
          ["-c", "user.name=Test", "-c", "user.email=test@openclaw.ai", ...args],
          { cwd: repoRoot },
        );
      await git("init", "--initial-branch=main", ".");
      await fs.writeFile(path.join(repoRoot, "a.txt"), "one\n");
      await git("add", "a.txt");
      await git("commit", "-m", "base");
      await git("remote", "add", "origin", "https://github.com/openclaw/openclaw.git");
      await git("remote", "add", "fork", "https://github.com/huwei-xydt/huwei-openclaw.git");
      await git("update-ref", "refs/remotes/origin/main", "HEAD");
      await git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
      await git("checkout", "-b", branchName);

      const fixture = await createFixture("operator.read", true, { spawnedCwd: repoRoot });
      try {
        // Before the push: origin holds no PR and no fork remote-tracking ref exists.
        await fixture.subscribe();
        await fixture.subscriptions.pollNow();
        expect(lastPulls(fixture.socket, sessionKey)).toEqual([]);

        // The push adds refs/remotes/fork/<branch>; context invalidation must pick it up.
        await git("update-ref", `refs/remotes/fork/${branchName}`, "HEAD");
        fixture.socket.send.mockClear();
        await fixture.subscriptions.pollNow();

        expect(lastPulls(fixture.socket, sessionKey)).toMatchObject([{ number: 182621 }]);
        const encodedBranch = encodeURIComponent(branchName);
        expect(
          seen.some((url) => url.includes("head=openclaw%3A") && url.includes(encodedBranch)),
        ).toBe(true);
        expect(
          seen.some((url) => url.includes("head=huwei-xydt%3A") && url.includes(encodedBranch)),
        ).toBe(true);
      } finally {
        await fixture.close();
        await fs.rm(repoRoot, { recursive: true, force: true });
      }
    });
  },
  PROOF_TIMEOUT_MS,
);
