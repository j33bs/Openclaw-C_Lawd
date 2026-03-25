import { describe, expect, it } from "vitest";
import { buildContinuityPromptSection } from "./continuity-prompt.js";

describe("buildContinuityPromptSection", () => {
  it("renders full sections for a rich bundle", () => {
    const section = buildContinuityPromptSection({
      confidence: "full",
      assembledAt: "2026-03-25T00:00:00.000Z",
      entries: [
        {
          kind: "daily-note",
          source: "memory/2026-03-25.md",
          date: "2026-03-25",
          content: "# Today\n- focus on continuity\n- ship the bundle\n",
        },
        {
          kind: "daily-note",
          source: "memory/2026-03-24.md",
          date: "2026-03-24",
          content: "# Yesterday\n- kept the backlog moving\n",
        },
        {
          kind: "pinned-doctrine",
          source: "nodes/c_lawd/MEMORY.md",
          content: "# Doctrine\n- stay local-first\n",
        },
        {
          kind: "session-snippet",
          source: "sessions/session-1.md",
          content: "remember the continuity bundle and the fallback path",
          score: 0.91,
        },
      ],
    });

    expect(section).toContain("## Recent Context [confidence: full]");
    expect(section).toContain("### Today (2026-03-25)");
    expect(section).toContain("### Yesterday (2026-03-24)");
    expect(section).toContain("### Active Doctrine");
    expect(section).toContain("### Related Sessions");
    expect(section).toContain("sessions/session-1.md");
  });

  it("renders the minimal notice for minimal bundles", () => {
    const section = buildContinuityPromptSection({
      confidence: "minimal",
      assembledAt: "2026-03-25T00:00:00.000Z",
      entries: [],
    });

    expect(section).toContain("Recent daily notes and pinned doctrine were not found");
  });

  it("does not crash on empty entries", () => {
    const section = buildContinuityPromptSection({
      confidence: "full",
      assembledAt: "2026-03-25T00:00:00.000Z",
      entries: [],
    });

    expect(section).toContain("confidence: minimal");
  });

  it("stays compact for long inputs", () => {
    const longText = Array.from({ length: 250 }, (_, index) => `word${index}`).join(" ");
    const section = buildContinuityPromptSection({
      confidence: "full",
      assembledAt: "2026-03-25T00:00:00.000Z",
      entries: [
        {
          kind: "daily-note",
          source: "memory/2026-03-25.md",
          date: "2026-03-25",
          content: longText,
        },
        {
          kind: "daily-note",
          source: "memory/2026-03-24.md",
          date: "2026-03-24",
          content: longText,
        },
        {
          kind: "pinned-doctrine",
          source: "nodes/c_lawd/MEMORY.md",
          content: longText,
        },
        {
          kind: "session-snippet",
          source: "sessions/session-1.md",
          content: longText,
          score: 0.8,
        },
      ],
    });

    const approxTokens = Math.ceil((section.trim().split(/\s+/u).length * 13) / 10);
    expect(approxTokens).toBeLessThanOrEqual(500);
  });
});
