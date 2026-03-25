import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveStateDir } from "../../../src/config/paths.js";
import { getSessionBindingService } from "../../../src/infra/outbound/session-binding-service.js";
import { importFreshModule } from "../../../test/helpers/import-fresh.js";

const {
  __testing,
  createTelegramThreadBindingManager,
  setTelegramThreadBindingIdleTimeoutBySessionKey,
  setTelegramThreadBindingMaxAgeBySessionKey,
} = await import("./thread-bindings.js");

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

describe("telegram thread bindings", () => {
  let stateDirOverride: string | undefined;

  beforeEach(() => {
    __testing.resetTelegramThreadBindingsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (stateDirOverride) {
      delete process.env.OPENCLAW_STATE_DIR;
      fs.rmSync(stateDirOverride, { recursive: true, force: true });
      stateDirOverride = undefined;
    }
  });

  it("registers a telegram binding adapter and binds current conversations", async () => {
    const manager = createTelegramThreadBindingManager({
      accountId: "work",
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 30_000,
      maxAgeMs: 0,
    });
    const bound = await getSessionBindingService().bind({
      targetSessionKey: "agent:main:subagent:child-1",
      targetKind: "subagent",
      conversation: {
        channel: "telegram",
        accountId: "work",
        conversationId: "-100200300:topic:77",
      },
      placement: "current",
      metadata: {
        boundBy: "user-1",
      },
    });

    expect(bound.conversation.channel).toBe("telegram");
    expect(bound.conversation.accountId).toBe("work");
    expect(bound.conversation.conversationId).toBe("-100200300:topic:77");
    expect(bound.targetSessionKey).toBe("agent:main:subagent:child-1");
    expect(manager.getByConversationId("-100200300:topic:77")?.boundBy).toBe("user-1");
  });

  it("does not support child placement", async () => {
    createTelegramThreadBindingManager({
      accountId: "default",
      persist: false,
      enableSweeper: false,
    });

    await expect(
      getSessionBindingService().bind({
        targetSessionKey: "agent:main:subagent:child-1",
        targetKind: "subagent",
        conversation: {
          channel: "telegram",
          accountId: "default",
          conversationId: "-100200300:topic:77",
        },
        placement: "child",
      }),
    ).rejects.toMatchObject({
      code: "BINDING_CAPABILITY_UNSUPPORTED",
    });
  });

  it("shares binding state across distinct module instances", async () => {
    const bindingsA = await importFreshModule<typeof import("./thread-bindings.js")>(
      import.meta.url,
      "./thread-bindings.js?scope=shared-a",
    );
    const bindingsB = await importFreshModule<typeof import("./thread-bindings.js")>(
      import.meta.url,
      "./thread-bindings.js?scope=shared-b",
    );

    bindingsA.__testing.resetTelegramThreadBindingsForTests();

    try {
      const managerA = bindingsA.createTelegramThreadBindingManager({
        accountId: "shared-runtime",
        persist: false,
        enableSweeper: false,
      });
      const managerB = bindingsB.createTelegramThreadBindingManager({
        accountId: "shared-runtime",
        persist: false,
        enableSweeper: false,
      });

      expect(managerB).toBe(managerA);

      await getSessionBindingService().bind({
        targetSessionKey: "agent:main:subagent:child-shared",
        targetKind: "subagent",
        conversation: {
          channel: "telegram",
          accountId: "shared-runtime",
          conversationId: "-100200300:topic:44",
        },
        placement: "current",
      });

      expect(
        bindingsB
          .getTelegramThreadBindingManager("shared-runtime")
          ?.getByConversationId("-100200300:topic:44")?.targetSessionKey,
      ).toBe("agent:main:subagent:child-shared");
    } finally {
      bindingsA.__testing.resetTelegramThreadBindingsForTests();
    }
  });

  it("updates lifecycle windows by session key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T10:00:00.000Z"));
    const manager = createTelegramThreadBindingManager({
      accountId: "work",
      persist: false,
      enableSweeper: false,
    });

    await getSessionBindingService().bind({
      targetSessionKey: "agent:main:subagent:child-1",
      targetKind: "subagent",
      conversation: {
        channel: "telegram",
        accountId: "work",
        conversationId: "1234",
      },
    });
    const original = manager.listBySessionKey("agent:main:subagent:child-1")[0];
    expect(original).toBeDefined();

    const idleUpdated = setTelegramThreadBindingIdleTimeoutBySessionKey({
      accountId: "work",
      targetSessionKey: "agent:main:subagent:child-1",
      idleTimeoutMs: 2 * 60 * 60 * 1000,
    });
    vi.setSystemTime(new Date("2026-03-06T12:00:00.000Z"));
    const maxAgeUpdated = setTelegramThreadBindingMaxAgeBySessionKey({
      accountId: "work",
      targetSessionKey: "agent:main:subagent:child-1",
      maxAgeMs: 6 * 60 * 60 * 1000,
    });

    expect(idleUpdated).toHaveLength(1);
    expect(idleUpdated[0]?.idleTimeoutMs).toBe(2 * 60 * 60 * 1000);
    expect(maxAgeUpdated).toHaveLength(1);
    expect(maxAgeUpdated[0]?.maxAgeMs).toBe(6 * 60 * 60 * 1000);
    expect(maxAgeUpdated[0]?.boundAt).toBe(original?.boundAt);
    expect(maxAgeUpdated[0]?.lastActivityAt).toBe(Date.parse("2026-03-06T12:00:00.000Z"));
    expect(manager.listBySessionKey("agent:main:subagent:child-1")[0]?.maxAgeMs).toBe(
      6 * 60 * 60 * 1000,
    );
  });

  it("serializes persistence writes per account", async () => {
    const firstWrite = createDeferred<void>();
    const secondWrite = createDeferred<void>();
    let writeIndex = 0;
    __testing.setPersistBindingsWriterForTests(async () => {
      writeIndex += 1;
      if (writeIndex === 1) {
        await firstWrite.promise;
        return;
      }
      if (writeIndex === 2) {
        await secondWrite.promise;
      }
    });

    createTelegramThreadBindingManager({
      accountId: "queued",
      persist: true,
      enableSweeper: false,
    });

    let firstResolved = false;
    let secondResolved = false;
    const firstBind = getSessionBindingService()
      .bind({
        targetSessionKey: "agent:main:subagent:child-1",
        targetKind: "subagent",
        conversation: {
          channel: "telegram",
          accountId: "queued",
          conversationId: "-100200300:topic:11",
        },
      })
      .then(() => {
        firstResolved = true;
      });
    const secondBind = getSessionBindingService()
      .bind({
        targetSessionKey: "agent:main:subagent:child-2",
        targetKind: "subagent",
        conversation: {
          channel: "telegram",
          accountId: "queued",
          conversationId: "-100200300:topic:12",
        },
      })
      .then(() => {
        secondResolved = true;
      });

    await Promise.resolve();
    expect(firstResolved).toBe(false);
    expect(secondResolved).toBe(false);

    firstWrite.resolve();
    await firstBind;
    await Promise.resolve();
    await Promise.resolve();

    expect(firstResolved).toBe(true);
    expect(secondResolved).toBe(false);

    secondWrite.resolve();
    await secondBind;
    expect(secondResolved).toBe(true);
  });

  it("logs persistence failures and keeps the queue moving", async () => {
    const logged: string[] = [];
    __testing.setPersistBindingsWriterForTests(async () => {
      throw new Error("disk boom");
    });
    __testing.setPersistBindingsLoggerForTests((message) => {
      logged.push(message);
    });

    createTelegramThreadBindingManager({
      accountId: "failed",
      persist: true,
      enableSweeper: false,
    });

    const firstBind = getSessionBindingService().bind({
      targetSessionKey: "agent:main:subagent:child-1",
      targetKind: "subagent",
      conversation: {
        channel: "telegram",
        accountId: "failed",
        conversationId: "-100200300:topic:21",
      },
    });
    const secondBind = getSessionBindingService().bind({
      targetSessionKey: "agent:main:subagent:child-2",
      targetKind: "subagent",
      conversation: {
        channel: "telegram",
        accountId: "failed",
        conversationId: "-100200300:topic:22",
      },
    });

    await Promise.all([firstBind, secondBind]);
    await Promise.resolve();
    await Promise.resolve();

    expect(logged).toHaveLength(2);
    expect(logged[0]).toContain(
      "telegram thread bindings persist failed (failed): Error: disk boom",
    );
  });

  it("does not persist lifecycle updates when manager persistence is disabled", async () => {
    stateDirOverride = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-telegram-bindings-"));
    process.env.OPENCLAW_STATE_DIR = stateDirOverride;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T10:00:00.000Z"));

    createTelegramThreadBindingManager({
      accountId: "no-persist",
      persist: false,
      enableSweeper: false,
    });

    await getSessionBindingService().bind({
      targetSessionKey: "agent:main:subagent:child-2",
      targetKind: "subagent",
      conversation: {
        channel: "telegram",
        accountId: "no-persist",
        conversationId: "-100200300:topic:88",
      },
    });

    setTelegramThreadBindingIdleTimeoutBySessionKey({
      accountId: "no-persist",
      targetSessionKey: "agent:main:subagent:child-2",
      idleTimeoutMs: 60 * 60 * 1000,
    });
    setTelegramThreadBindingMaxAgeBySessionKey({
      accountId: "no-persist",
      targetSessionKey: "agent:main:subagent:child-2",
      maxAgeMs: 2 * 60 * 60 * 1000,
    });

    const statePath = path.join(
      resolveStateDir(process.env, os.homedir),
      "telegram",
      "thread-bindings-no-persist.json",
    );
    expect(fs.existsSync(statePath)).toBe(false);
  });

  it("persists unbinds before restart so removed bindings do not come back", async () => {
    stateDirOverride = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-telegram-bindings-"));
    process.env.OPENCLAW_STATE_DIR = stateDirOverride;

    createTelegramThreadBindingManager({
      accountId: "default",
      persist: true,
      enableSweeper: false,
    });

    const bound = await getSessionBindingService().bind({
      targetSessionKey: "plugin-binding:openclaw-codex-app-server:abc123",
      targetKind: "session",
      conversation: {
        channel: "telegram",
        accountId: "default",
        conversationId: "8460800771",
      },
    });

    await getSessionBindingService().unbind({
      bindingId: bound.bindingId,
      reason: "test-detach",
    });

    __testing.resetTelegramThreadBindingsForTests();

    const reloaded = createTelegramThreadBindingManager({
      accountId: "default",
      persist: true,
      enableSweeper: false,
    });

    expect(reloaded.getByConversationId("8460800771")).toBeUndefined();
  });
});
