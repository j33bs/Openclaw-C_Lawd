import { describe, expect, it } from "vitest";
import { buildModelAliasIndex, resolveModelRefFromString } from "../model-selection.js";
import { resolveSessionStatusToolConfig } from "./session-status-tool.js";

function createConfig(params: { alias?: string }) {
  return {
    agents: {
      defaults: {
        model: { primary: "openai-codex/gpt-5.4" },
        models: {
          "openai-codex/gpt-5.4": {},
          "xai/grok-4.20-beta-latest-reasoning": params.alias ? { alias: params.alias } : {},
        },
      },
    },
  };
}

describe("resolveSessionStatusToolConfig", () => {
  it("prefers live config for model overrides so fresh aliases resolve", () => {
    const staleConfig = createConfig({});
    const liveConfig = createConfig({ alias: "groklatest" });

    const staleAliasIndex = buildModelAliasIndex({
      cfg: staleConfig,
      defaultProvider: "openai-codex",
    });
    const staleResolved = resolveModelRefFromString({
      raw: "groklatest",
      defaultProvider: "openai-codex",
      aliasIndex: staleAliasIndex,
    });
    expect(staleResolved?.ref).toEqual({
      provider: "openai-codex",
      model: "groklatest",
    });

    const chosen = resolveSessionStatusToolConfig({
      liveConfig,
      toolConfig: staleConfig,
      modelRaw: "groklatest",
    });
    const liveAliasIndex = buildModelAliasIndex({
      cfg: chosen,
      defaultProvider: "openai-codex",
    });
    const liveResolved = resolveModelRefFromString({
      raw: "groklatest",
      defaultProvider: "openai-codex",
      aliasIndex: liveAliasIndex,
    });
    expect(liveResolved?.ref).toEqual({
      provider: "xai",
      model: "grok-4.20-beta-latest-reasoning",
    });
  });

  it("keeps the tool snapshot for read-only status requests", () => {
    const staleConfig = createConfig({});
    const liveConfig = createConfig({ alias: "groklatest" });

    const chosen = resolveSessionStatusToolConfig({
      liveConfig,
      toolConfig: staleConfig,
      modelRaw: undefined,
    });

    expect(chosen).toBe(staleConfig);
  });
});
