import { describe, expect, it } from "vitest";
import { isCronScratchEffectivelyEmpty } from "./scratch-contract.js";

const heartbeatBoilerplate = `# Keep this file empty (or with only comments) to skip heartbeat API calls.
# Add tasks below when you want the agent to check something periodically.

## Related
- [Heartbeat config](/gateway/config-agents)`;

describe("isCronScratchEffectivelyEmpty", () => {
  it("treats the shipped heartbeat boilerplate scratch as empty", () => {
    expect(isCronScratchEffectivelyEmpty(heartbeatBoilerplate)).toBe(true);
  });

  it("treats missing or null scratch as non-empty (it runs)", () => {
    expect(isCronScratchEffectivelyEmpty(undefined)).toBe(false);
    expect(isCronScratchEffectivelyEmpty(null)).toBe(false);
  });

  it("treats an HTML comment-only scratch as empty", () => {
    expect(isCronScratchEffectivelyEmpty("<!-- no periodic checks -->")).toBe(true);
    expect(
      isCronScratchEffectivelyEmpty("<!-- a multi\nline comment\nwithout content -->"),
    ).toBe(true);
  });

  it("treats headers, empty checkboxes, and fenced code blocks as scaffolding", () => {
    expect(isCronScratchEffectivelyEmpty("# Only a heading\n\n## Another")).toBe(true);
    expect(isCronScratchEffectivelyEmpty("- [ ]\n- [x]\n* [X]")).toBe(true);
    expect(isCronScratchEffectivelyEmpty("```\n```")).toBe(true);
    expect(isCronScratchEffectivelyEmpty("```ts\n```")).toBe(true);
  });

  it("treats a bare markdown-link list item (no checkbox) as scaffolding", () => {
    expect(isCronScratchEffectivelyEmpty("- [Heartbeat config](/gateway/config-agents)")).toBe(
      true,
    );
    expect(isCronScratchEffectivelyEmpty("- [Docs](https://example.com)")).toBe(true);
    expect(isCronScratchEffectivelyEmpty("* [Read more](https://example.com/a?b=1)")).toBe(true);
  });

  it("keeps real tasks non-empty", () => {
    expect(isCronScratchEffectivelyEmpty("- [ ] Deploy the staging release")).toBe(false);
    expect(isCronScratchEffectivelyEmpty("- [ ] [Read docs](https://example.com)")).toBe(false);
    expect(isCronScratchEffectivelyEmpty("- check disk usage and report")).toBe(false);
    expect(isCronScratchEffectivelyEmpty("Check for pending security updates")).toBe(false);
  });
});
