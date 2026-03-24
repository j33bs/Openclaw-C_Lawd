import { describe, expect, it } from "vitest";
import {
  FeltSenseStateSchema,
  FlourishingMetricRecordSchema,
  ProjectStateSnapshotSchema,
  classifyProjectPhase,
  createFeltSenseState,
  summarizeFlourishing,
} from "./phase1.js";

describe("flourishing phase 1 instrumentation", () => {
  it("parses a felt-sense session boundary record", () => {
    const state = createFeltSenseState({
      boundary: "session_open",
      timestamp: "2026-03-24T11:00:00.000Z",
      feltShift: 1,
      energy: 6,
      clarity: 7,
      emotionalLoad: 3,
      textures: ["alive", "clear"],
      bodyAnchor: "chest warm, jaw loose",
      note: "came in with real curiosity",
    });

    expect(FeltSenseStateSchema.parse(state)).toMatchObject({
      boundary: "session_open",
      textures: ["alive", "clear"],
    });
  });

  it("classifies incubation separately from drift", () => {
    const incubating = classifyProjectPhase(
      ProjectStateSnapshotSchema.parse({
        projectKey: "flourishing-mission",
        timestamp: "2026-03-24T11:00:00.000Z",
        lastMeaningfulTouch: "2026-03-23T11:00:00.000Z",
        momentum: 4,
        clarity: 4,
        pull: 8,
        evidenceOfProgress: 3,
        driftSignals: [],
        incubationQuestion: "What is the smallest believable metric slice?",
      }),
    );

    const drifting = classifyProjectPhase(
      ProjectStateSnapshotSchema.parse({
        projectKey: "flourishing-mission",
        timestamp: "2026-03-24T11:00:00.000Z",
        lastMeaningfulTouch: "2026-03-10T11:00:00.000Z",
        momentum: 3,
        clarity: 5,
        pull: 4,
        evidenceOfProgress: 2,
        driftSignals: ["avoiding real instrumentation", "rewriting scope every pass"],
      }),
    );

    expect(incubating).toBe("incubating");
    expect(drifting).toBe("drifting");
  });

  it("summarizes the five-axis flourishing profile", () => {
    const summary = summarizeFlourishing(
      FlourishingMetricRecordSchema.parse({
        metricKey: "session-2026-03-24-open",
        timestamp: "2026-03-24T11:00:00.000Z",
        source: "session_observation",
        scores: {
          coherence: 7,
          vitality: 5,
          agency: 8,
          truth_contact: 4,
          connection: 6,
        },
        evidence: ["named a real uncertainty instead of smoothing over it"],
        linkedProject: "flourishing-mission",
        linkedSessionBoundary: "session_open",
      }),
    );

    expect(summary.average).toBe(6);
    expect(summary.weakestAxis).toBe("truth_contact");
    expect(summary.belowThreshold).toEqual(["truth_contact"]);
  });
});
