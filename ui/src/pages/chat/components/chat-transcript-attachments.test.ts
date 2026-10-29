import { describe, expect, it } from "vitest";
import type { TranscriptAttachmentEntry } from "./chat-sidebar-content-types.ts";
import { transcriptAttachmentMatches } from "./chat-transcript-attachments.ts";

function entryWithLabel(label: string): TranscriptAttachmentEntry {
  return {
    key: "attachment:cafe",
    kind: "attachment",
    label,
    options: {},
    onOpenSidebar: () => {},
    item: {
      type: "attachment",
      attachment: {
        name: "cafe.png",
        mimeType: "image/png",
        url: "openclaw://attachment/cafe.png",
      },
    },
  } as TranscriptAttachmentEntry;
}

describe("transcriptAttachmentMatches", () => {
  // Stored NFD (e + combining acute); user types NFC (precomposed e-acute).
  const nfdLabel = "Caf\u0301.png";
  const nfcQuery = "Caf\u00e9";

  it("matches a canonically equivalent Unicode query against a stored NFD label", () => {
    expect(nfdLabel).not.toBe(nfcQuery);
    expect(nfdLabel.normalize("NFC")).toBe(nfcQuery);
    expect(transcriptAttachmentMatches(entryWithLabel(nfdLabel), nfcQuery)).toBe(true);
  });

  it("matches an NFD query against a stored NFC label", () => {
    const nfcLabel = "Caf\u00e9.png";
    expect(nfcLabel).not.toBe(nfdLabel);
    expect(transcriptAttachmentMatches(entryWithLabel(nfcLabel), "Caf\u0301")).toBe(true);
  });

  it("still rejects non-matching queries", () => {
    expect(transcriptAttachmentMatches(entryWithLabel(nfdLabel), "zzz")).toBe(false);
    expect(transcriptAttachmentMatches(entryWithLabel("report.pdf"), "cafe")).toBe(false);
  });
});
