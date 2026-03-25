import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { captureEnv } from "../test-utils/env.js";
import { startGatewayServer } from "./server.js";
import { getFreeGatewayPort } from "./test-helpers.e2e.js";

let writeConfigFile: typeof import("../config/config.js").writeConfigFile;

beforeAll(async () => {
  ({ writeConfigFile } = await import("../config/config.js"));
});

describe("gateway flourishing cron startup", () => {
  it("seeds built-in flourishing cron jobs on startup", { timeout: 30_000 }, async () => {
    const envSnapshot = captureEnv([
      "HOME",
      "OPENCLAW_STATE_DIR",
      "OPENCLAW_CONFIG_PATH",
      "OPENCLAW_GATEWAY_TOKEN",
      "OPENCLAW_SKIP_CHANNELS",
      "OPENCLAW_SKIP_GMAIL_WATCHER",
      "OPENCLAW_SKIP_CRON",
      "OPENCLAW_SKIP_CANVAS_HOST",
      "OPENCLAW_SKIP_BROWSER_CONTROL_SERVER",
    ]);

    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-gw-flourishing-home-"));
    process.env.HOME = tempHome;
    delete process.env.OPENCLAW_STATE_DIR;
    delete process.env.OPENCLAW_CONFIG_PATH;
    delete process.env.OPENCLAW_SKIP_CRON;
    process.env.OPENCLAW_SKIP_CHANNELS = "1";
    process.env.OPENCLAW_SKIP_GMAIL_WATCHER = "1";
    process.env.OPENCLAW_SKIP_CANVAS_HOST = "1";
    process.env.OPENCLAW_SKIP_BROWSER_CONTROL_SERVER = "1";

    const token = `flourishing-startup-${Date.now()}`;
    process.env.OPENCLAW_GATEWAY_TOKEN = token;

    const workspaceDir = path.join(tempHome, "openclaw");
    await fs.mkdir(workspaceDir, { recursive: true });
    const cronStore = path.join(tempHome, ".openclaw", "cron", "jobs.json");

    await writeConfigFile({
      agents: {
        defaults: {
          workspace: workspaceDir,
        },
      },
      cron: {
        store: cronStore,
      },
      gateway: {
        auth: {
          mode: "token",
          token,
        },
      },
    });

    const port = await getFreeGatewayPort();
    const server = await startGatewayServer(port, {
      bind: "loopback",
      controlUiEnabled: false,
      auth: { mode: "token", token },
    });

    try {
      const raw = await fs.readFile(cronStore, "utf8");
      const parsed = JSON.parse(raw) as {
        jobs?: Array<{
          name?: string;
          payload?: { kind?: string; message?: string };
        }>;
      };
      const builtinJobs = (parsed.jobs ?? [])
        .filter((job) => job.payload?.kind === "agentTurn")
        .map((job) => ({
          name: job.name,
          message: job.payload?.message,
        }));

      expect(builtinJobs).toEqual(
        expect.arrayContaining([
          {
            name: "Flourishing Truthfulness Audit",
            message: "__builtin__:truthfulness-audit",
          },
          {
            name: "Flourishing Fitness Sweep",
            message: "__builtin__:fitness-sweep",
          },
          {
            name: "Flourishing Sunset Check",
            message: "__builtin__:sunset-check",
          },
        ]),
      );
    } finally {
      await server.close({ reason: "flourishing cron startup test complete" });
      await fs.rm(tempHome, { recursive: true, force: true });
      envSnapshot.restore();
    }
  });
});
