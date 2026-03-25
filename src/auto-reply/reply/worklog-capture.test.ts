import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { SILENT_REPLY_TOKEN } from "../tokens.js";
import { captureWorklogIfNeeded, __testing } from "./worklog-capture.js";

function createConfig(workspaceDir: string): OpenClawConfig {
  return {
    agents: {
      defaults: {
        userTimezone: "Australia/Brisbane",
      },
      list: [{ id: "main", default: true, workspace: workspaceDir }],
    },
  } as OpenClawConfig;
}

describe("worklog capture", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dir) => {
        await fs.rm(dir, { recursive: true, force: true });
      }),
    );
  });

  it("appends a durable daily-note entry for direct owner mutation runs", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-worklog-"));
    tempDirs.push(workspaceDir);
    const result = await captureWorklogIfNeeded({
      cfg: createConfig(workspaceDir),
      workspaceDir,
      sessionKey: "agent:main:telegram:direct:123",
      chatType: "direct",
      originatingChannel: "telegram",
      messageProvider: "telegram",
      senderIsOwner: true,
      promptSummary: "Implement Telegram parity and remember the work",
      payloads: [{ text: "Implemented the Telegram memory parity changes." }],
      toolMetas: [
        { toolName: "apply_patch", meta: "src/auto-reply/reply/worklog-capture.ts" },
        { toolName: "exec", meta: "node_modules/.bin/vitest run worklog-capture.test.ts" },
      ],
      nowMs: Date.parse("2026-03-24T10:15:00+10:00"),
    });

    expect(result.written).toBe(true);
    const notePath = path.join(workspaceDir, "memory", "2026-03-24.md");
    const note = await fs.readFile(notePath, "utf-8");
    expect(note).toContain("### 10:15 telegram work");
    expect(note).toContain("Request: Implement Telegram parity and remember the work");
    expect(note).toContain("Outcome: Implemented the Telegram memory parity changes.");
    expect(note).toContain("- apply_patch: src/auto-reply/reply/worklog-capture.ts");
  });

  it("captures silent successful mutation turns without a user-facing reply", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-worklog-silent-"));
    tempDirs.push(workspaceDir);
    const result = await captureWorklogIfNeeded({
      cfg: createConfig(workspaceDir),
      workspaceDir,
      sessionKey: "agent:main:telegram:direct:124",
      chatType: "direct",
      originatingChannel: "telegram",
      messageProvider: "telegram",
      senderIsOwner: true,
      promptSummary: "Send the update silently",
      payloads: [{ text: SILENT_REPLY_TOKEN }],
      toolMetas: [{ toolName: "message", meta: "action=send" }],
      nowMs: Date.parse("2026-03-24T10:25:00+10:00"),
    });

    expect(result.written).toBe(true);
    const notePath = path.join(workspaceDir, "memory", "2026-03-24.md");
    const note = await fs.readFile(notePath, "utf-8");
    expect(note).toContain("Outcome: (no user-facing reply)");
    expect(note).toContain("- message: action=send");
  });

  it("skips non-owner or non-direct runs", async () => {
    expect(
      __testing.shouldCaptureWorklog({
        channel: "telegram",
        chatType: "group",
        senderIsOwner: true,
        toolSummaries: ["apply_patch: foo.ts"],
      }),
    ).toBe(false);
    expect(
      __testing.shouldCaptureWorklog({
        channel: "telegram",
        chatType: "direct",
        senderIsOwner: false,
        toolSummaries: ["apply_patch: foo.ts"],
      }),
    ).toBe(false);
  });
});
