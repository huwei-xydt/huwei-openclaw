// Real-checkout context tests: remotes and remote-tracking refs decide PR head owners.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runGitReadOperation } from "../infra/git-read-cache.js";
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
    await git("update-ref", "refs/remotes/origin/main", "HEAD");
    await git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
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

  it("keeps the owner whose branch ref exists when an older remote lacks it (#183747)", async () => {
    await git("remote", "remove", "fork");
    await git("remote", "add", "a-old", "https://github.com/huwei-xydt/old-clone.git");
    await git("remote", "add", "z-fork", "https://github.com/huwei-xydt/huwei-openclaw.git");
    // Only the later-listed remote received the branch push.
    await git("update-ref", "refs/remotes/z-fork/fix/session-pr-fork-remote", "HEAD");
    const context = await readCheckoutGitContext(root);
    expect(context?.alternateHeadOwners).toEqual(["huwei-xydt"]);
  });

  it("ignores public-GitHub alternates when the origin is an Enterprise host (#183747)", async () => {
    await git("remote", "set-url", "origin", "https://ghe.example.test/openclaw/openclaw.git");
    await git("remote", "remove", "fork");
    await git("remote", "add", "public-fork", "https://github.com/alice/project.git");
    await git("update-ref", "refs/remotes/public-fork/fix/session-pr-fork-remote", "HEAD");
    const context = await readCheckoutGitContext(root, "ghe.example.test");
    expect(context).toMatchObject({ owner: "openclaw", host: "ghe.example.test" });
    expect(context?.alternateHeadOwners).toBeUndefined();
  });

  it("ignores Enterprise alternates when the origin is public GitHub (#183747)", async () => {
    await git("remote", "remove", "fork");
    await git("remote", "add", "ghe-fork", "https://ghe.example.test/alice/project.git");
    await git("update-ref", "refs/remotes/ghe-fork/fix/session-pr-fork-remote", "HEAD");
    const context = await readCheckoutGitContext(root, "ghe.example.test");
    expect(context).toMatchObject({ owner: "openclaw" });
    expect(context).not.toHaveProperty("host");
    expect(context?.alternateHeadOwners).toBeUndefined();
  });

  it("re-reads cached context after the branch's first fork push (#183747)", async () => {
    await git("update-ref", "-d", "refs/remotes/fork/fix/session-pr-fork-remote");
    const before = await runGitReadOperation({ type: "checkout.context", input: { root } });
    expect(before).toMatchObject({ owner: "openclaw" });
    expect(before?.alternateHeadOwners).toBeUndefined();

    // The push adds the remote-tracking ref the fork owner lookup depends on.
    await git("update-ref", "refs/remotes/fork/fix/session-pr-fork-remote", "HEAD");
    const after = await runGitReadOperation({ type: "checkout.context", input: { root } });
    expect(after?.alternateHeadOwners).toEqual(["huwei-xydt"]);
  });

  it("discovers the fork owner from packed remote-tracking refs without a loose ref (#183747)", async () => {
    await git("update-ref", "-d", "refs/remotes/fork/fix/session-pr-fork-remote");
    await git("update-ref", "refs/remotes/fork/fix/session-pr-fork-remote", "HEAD");
    await git("pack-refs", "--all");
    await expect(
      fs.access(
        path.join(root, ".git", "refs", "remotes", "fork", "fix", "session-pr-fork-remote"),
      ),
    ).rejects.toThrowError();

    const context = await runGitReadOperation({ type: "checkout.context", input: { root } });
    expect(context?.alternateHeadOwners).toEqual(["huwei-xydt"]);
  });
});
