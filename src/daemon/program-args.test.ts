import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
}));

const openclawRootMocks = vi.hoisted(() => ({
  resolveOpenClawPackageRootSync: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  access: vi.fn(),
  realpath: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: { access: fsMocks.access, realpath: fsMocks.realpath },
  access: fsMocks.access,
  realpath: fsMocks.realpath,
}));

vi.mock("node:child_process", () => ({
  execFileSync: childProcessMocks.execFileSync,
}));

vi.mock("../infra/openclaw-root.js", () => ({
  resolveOpenClawPackageRootSync: openclawRootMocks.resolveOpenClawPackageRootSync,
}));

import { resolveGatewayProgramArguments } from "./program-args.js";

const originalArgv = [...process.argv];

afterEach(() => {
  process.argv = [...originalArgv];
  vi.resetAllMocks();
  openclawRootMocks.resolveOpenClawPackageRootSync.mockReturnValue(null);
});

describe("resolveGatewayProgramArguments", () => {
  it("uses realpath-resolved dist entry when running via npx shim", async () => {
    const argv1 = path.resolve("/tmp/.npm/_npx/63c3/node_modules/.bin/openclaw");
    const entryPath = path.resolve("/tmp/.npm/_npx/63c3/node_modules/openclaw/dist/entry.js");
    process.argv = ["node", argv1];
    fsMocks.realpath.mockResolvedValue(entryPath);
    fsMocks.access.mockImplementation(async (target: string) => {
      if (target === entryPath) {
        return;
      }
      throw new Error("missing");
    });

    const result = await resolveGatewayProgramArguments({ port: 18789 });

    expect(result.programArguments).toEqual([
      process.execPath,
      entryPath,
      "gateway",
      "--port",
      "18789",
    ]);
  });

  it("prefers symlinked path over realpath for stable service config", async () => {
    // Simulates pnpm global install where node_modules/openclaw is a symlink
    // to .pnpm/openclaw@X.Y.Z/node_modules/openclaw
    const symlinkPath = path.resolve(
      "/Users/test/Library/pnpm/global/5/node_modules/openclaw/dist/entry.js",
    );
    const realpathResolved = path.resolve(
      "/Users/test/Library/pnpm/global/5/node_modules/.pnpm/openclaw@2026.1.21-2/node_modules/openclaw/dist/entry.js",
    );
    process.argv = ["node", symlinkPath];
    fsMocks.realpath.mockResolvedValue(realpathResolved);
    fsMocks.access.mockResolvedValue(undefined); // Both paths exist

    const result = await resolveGatewayProgramArguments({ port: 18789 });

    // Should use the symlinked path, not the realpath-resolved versioned path
    expect(result.programArguments[1]).toBe(symlinkPath);
    expect(result.programArguments[1]).not.toContain("@2026.1.21-2");
  });

  it("prefers the current package root dist entry over a stale global argv1 path", async () => {
    const globalEntry = path.resolve(
      "/Users/test/.npm-global/lib/node_modules/openclaw/dist/entry.js",
    );
    const repoRoot = path.resolve("/Users/test/src/openclaw");
    const repoEntry = path.join(repoRoot, "dist", "entry.js");
    process.argv = ["node", globalEntry];
    openclawRootMocks.resolveOpenClawPackageRootSync.mockReturnValue(repoRoot);
    fsMocks.access.mockImplementation(async (target: string) => {
      if (target === repoEntry) {
        return;
      }
      throw new Error("missing");
    });

    const result = await resolveGatewayProgramArguments({ port: 18789, runtime: "node" });

    expect(result.programArguments).toEqual([
      process.execPath,
      repoEntry,
      "gateway",
      "--port",
      "18789",
    ]);
  });

  it("falls back to node_modules package dist when .bin path is not resolved", async () => {
    const argv1 = path.resolve("/tmp/.npm/_npx/63c3/node_modules/.bin/openclaw");
    const indexPath = path.resolve("/tmp/.npm/_npx/63c3/node_modules/openclaw/dist/index.js");
    process.argv = ["node", argv1];
    fsMocks.realpath.mockRejectedValue(new Error("no realpath"));
    fsMocks.access.mockImplementation(async (target: string) => {
      if (target === indexPath) {
        return;
      }
      throw new Error("missing");
    });

    const result = await resolveGatewayProgramArguments({ port: 18789 });

    expect(result.programArguments).toEqual([
      process.execPath,
      indexPath,
      "gateway",
      "--port",
      "18789",
    ]);
  });

  it("uses src/entry.ts for bun dev mode", async () => {
    const repoIndexPath = path.resolve("/repo/src/index.ts");
    const repoEntryPath = path.resolve("/repo/src/entry.ts");
    process.argv = ["/usr/local/bin/node", repoIndexPath];
    fsMocks.realpath.mockResolvedValue(repoIndexPath);
    fsMocks.access.mockResolvedValue(undefined);
    childProcessMocks.execFileSync.mockReturnValue("/usr/local/bin/bun\n");

    const result = await resolveGatewayProgramArguments({
      dev: true,
      port: 18789,
      runtime: "bun",
    });

    expect(result.programArguments).toEqual([
      "/usr/local/bin/bun",
      repoEntryPath,
      "gateway",
      "--port",
      "18789",
    ]);
    expect(result.workingDirectory).toBe(path.resolve("/repo"));
  });
});
