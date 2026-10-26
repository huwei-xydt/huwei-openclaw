// Real-checkout context tests: remotes and remote-tracking refs decide PR head owners.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCheckoutGitContext } from "./control-ui-session-prs-git.runtime.js";

const execFileAsync = promisify(execFile);

describe("readCheckoutGitContext", () => {
  let root: string;

  const git = (...args: string[]) =>
    execFileAsync("git", ["-c", "user.email=test@openclaw.ai", "-c", "user.name=Test", ...args], {
      cwd: root,
    });

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-prs-context-")));
    await git("init", "--initial-branch=main", ".");
    await fs.writeFile(path.join(root, "a.txt"), "one\n");
    await git("add", "a.txt");
    await git("commit", "-m", "base");
    await git("remote", "add", "origin", "https://github.com/openclaw/openclaw.git");
    await git("remote", "add", "fork", "https://github.com/huwei-xydt/huwei-openclaw.git");
    await git("checkout", "-b", "fix/session-pr-fork-remote");
    // Simulates `git push fork <branch>` without contacting the network.
    await git("update-ref", "refs/remotes/fork/fix/session-pr-fork-remote", "HEAD");
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("exposes the fork remote owner when only that remote holds the branch (#183747)", async () => {
    const context = await readCheckoutGitContext(root);
    expect(context).toMatchObject({
      owner: "openclaw",
      repo: "openclaw",
      branch: "fix/session-pr-fork-remote",
      alternateHeadOwners: ["huwei-xydt"],
    });
  });

  it("omits alternate head owners when no other GitHub remote holds the branch", async () => {
    await git("update-ref", "-d", "refs/remotes/fork/fix/session-pr-fork-remote");
    const context = await readCheckoutGitContext(root);
    expect(context?.alternateHeadOwners).toBeUndefined();
  });

  it("ignores non-GitHub remotes that hold the branch", async () => {
    await git("update-ref", "-d", "refs/remotes/fork/fix/session-pr-fork-remote");
    await git("remote", "add", "gitlab", "https://gitlab.com/other/clone.git");
    await git("update-ref", "refs/remotes/gitlab/fix/session-pr-fork-remote", "HEAD");
    const context = await readCheckoutGitContext(root);
    expect(context?.alternateHeadOwners).toBeUndefined();
  });
});
