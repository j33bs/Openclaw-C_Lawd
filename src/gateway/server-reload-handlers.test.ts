import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildGatewayCronServiceMock,
  ensureFlourishingCronJobsMock,
  resetDirectoryCacheMock,
  setCommandLaneConcurrencyMock,
} = vi.hoisted(() => ({
  buildGatewayCronServiceMock: vi.fn(),
  ensureFlourishingCronJobsMock: vi.fn(),
  resetDirectoryCacheMock: vi.fn(),
  setCommandLaneConcurrencyMock: vi.fn(),
}));

vi.mock("../infra/outbound/target-resolver.js", () => ({
  resetDirectoryCache: resetDirectoryCacheMock,
}));

vi.mock("../process/command-queue.js", () => ({
  getTotalQueueSize: () => 0,
  setCommandLaneConcurrency: setCommandLaneConcurrencyMock,
}));

vi.mock("./server-cron.js", () => ({
  buildGatewayCronService: buildGatewayCronServiceMock,
  ensureFlourishingCronJobs: ensureFlourishingCronJobsMock,
}));

import { createGatewayReloadHandlers } from "./server-reload-handlers.js";

describe("createGatewayReloadHandlers", () => {
  beforeEach(() => {
    buildGatewayCronServiceMock.mockReset();
    ensureFlourishingCronJobsMock.mockReset();
    resetDirectoryCacheMock.mockReset();
    setCommandLaneConcurrencyMock.mockReset();
  });

  it("reseeds flourishing cron jobs before starting rebuilt cron state", async () => {
    const oldCronStop = vi.fn();
    const newCronStart = vi.fn(async () => {});
    const nextCronState = {
      cron: {
        start: newCronStart,
        stop: vi.fn(),
      },
    };
    buildGatewayCronServiceMock.mockReturnValue(nextCronState);
    ensureFlourishingCronJobsMock.mockResolvedValue(undefined);

    let state: unknown = {
      hooksConfig: {},
      hookClientIpConfig: {},
      heartbeatRunner: {
        stop: vi.fn(),
        updateConfig: vi.fn(),
      },
      cronState: {
        cron: {
          stop: oldCronStop,
        },
      },
      browserControl: null,
      channelHealthMonitor: null,
    };

    const setState = vi.fn((nextState: unknown) => {
      state = nextState;
    });

    const handlers = createGatewayReloadHandlers({
      deps: {} as never,
      broadcast: () => {},
      defaultWorkspaceDir: "/tmp/openclaw",
      getState: (() => state) as never,
      setState: setState as never,
      startChannel: async () => {},
      stopChannel: async () => {},
      logHooks: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      logBrowser: { error: vi.fn() },
      logChannels: {
        info: vi.fn(),
        error: vi.fn(),
      },
      logCron: { error: vi.fn() },
      logReload: {
        info: vi.fn(),
        warn: vi.fn(),
      },
      createHealthMonitor: () => ({
        stop: vi.fn(),
      }),
    });

    await handlers.applyHotReload(
      {
        changedPaths: ["cron.store"],
        restartGateway: false,
        restartReasons: [],
        hotReasons: ["cron.store"],
        noopPaths: [],
        restartGmailWatcher: false,
        reloadHooks: false,
        restartHeartbeat: false,
        restartCron: true,
        restartBrowserControl: false,
        restartHealthMonitor: false,
        restartChannels: new Set(),
      },
      {} as never,
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(oldCronStop).toHaveBeenCalledOnce();
    expect(resetDirectoryCacheMock).toHaveBeenCalledOnce();
    expect(buildGatewayCronServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceDir: "/tmp/openclaw",
      }),
    );
    expect(ensureFlourishingCronJobsMock).toHaveBeenCalledWith({
      cron: nextCronState.cron,
      workspaceDir: "/tmp/openclaw",
    });
    expect(newCronStart).toHaveBeenCalledOnce();
    expect(setState).toHaveBeenCalledWith(
      expect.objectContaining({
        cronState: nextCronState,
      }),
    );
  });
});
