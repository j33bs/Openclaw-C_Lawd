import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { telegramPlugin } from "../../extensions/telegram/src/channel.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createTestRegistry } from "../test-utils/channel-plugins.js";
import { getHealthSnapshot } from "./health.js";

let testConfig: Record<string, unknown> = {};
let testStore: Record<string, { updatedAt?: number }> = {};

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => testConfig,
  };
});

vi.mock("../config/sessions.js", () => ({
  resolveStorePath: () => "/tmp/sessions.json",
  loadSessionStore: () => testStore,
  readSessionUpdatedAt: vi.fn(() => undefined),
  recordSessionMetaFromInbound: vi.fn().mockResolvedValue(undefined),
  updateLastRoute: vi.fn().mockResolvedValue(undefined),
}));

let createPluginRuntime: typeof import("../plugins/runtime/index.js").createPluginRuntime;
let setTelegramRuntime: typeof import("../../extensions/telegram/src/runtime.js").setTelegramRuntime;

describe("getHealthSnapshot runtime snapshots", () => {
  beforeAll(async () => {
    ({ createPluginRuntime } = await import("../plugins/runtime/index.js"));
    ({ setTelegramRuntime } = await import("../../extensions/telegram/src/runtime.js"));
  });

  beforeEach(() => {
    testConfig = {};
    testStore = {};
    setActivePluginRegistry(
      createTestRegistry([{ pluginId: "telegram", plugin: telegramPlugin, source: "test" }]),
    );
    setTelegramRuntime(createPluginRuntime());
    vi.stubEnv("DISCORD_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
  });

  it("uses runtime snapshots for telegram lifecycle fields without probing", async () => {
    testConfig = { channels: { telegram: { botToken: "t-1" } } };

    const snap = await getHealthSnapshot({
      timeoutMs: 10,
      probe: false,
      runtimeSnapshot: {
        channels: {
          telegram: {
            accountId: "default",
            running: true,
            lastStartAt: 1234,
            lastStopAt: null,
            lastError: null,
          },
        },
        channelAccounts: {
          telegram: {
            default: {
              accountId: "default",
              running: true,
              lastStartAt: 1234,
              lastStopAt: null,
              lastError: null,
            },
          },
        },
      },
    });

    const telegram = snap.channels.telegram as {
      configured?: boolean;
      running?: boolean;
      lastStartAt?: number | null;
      tokenSource?: string;
      mode?: string | null;
      probe?: unknown;
    };

    expect(telegram.configured).toBe(true);
    expect(telegram.running).toBe(true);
    expect(telegram.lastStartAt).toBe(1234);
    expect(telegram.tokenSource).toBe("config");
    expect(telegram.mode).toBe("polling");
    expect(telegram.probe).toBeUndefined();
  });
});
