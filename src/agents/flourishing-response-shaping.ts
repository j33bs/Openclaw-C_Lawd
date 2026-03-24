export type MeaningDensityScore = {
  score: number;
  verdict: "low" | "medium" | "high";
  reasons: string[];
};

export type MeaningDensityInput = {
  directUserGoal?: boolean;
  truthContact?: boolean;
  userAgency?: boolean;
  relationshipCare?: boolean;
  longHorizon?: boolean;
  irreversibleAction?: boolean;
  decorativeRisk?: boolean;
  collapseRisk?: boolean;
};

export type ResponseMode = "agency_first" | "tight_execute" | "repair";

export type ResponseModeInput = {
  repeatedFailures?: number;
  userUncertainty?: boolean;
  asksForDelegation?: boolean;
  irreversibleAction?: boolean;
  collapseRisk?: boolean;
  relationalStrain?: boolean;
};

export type RepairLoopSignals = {
  mismatch?: "none" | "minor" | "clear";
  userFriction?: boolean;
  assistantOverreach?: boolean;
  confidenceDrop?: boolean;
};

export type FlourishingPromptConfig = {
  enabled?: boolean;
  meaningDensity?: {
    enabled?: boolean;
    executionMinScore?: number;
  };
  responseMode?: {
    enabled?: boolean;
    defaultMode?: Extract<ResponseMode, "agency_first" | "tight_execute">;
    collapseFailureThreshold?: number;
  };
  repairLoop?: {
    enabled?: boolean;
  };
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(3, Math.round(value)));
}

export function scoreMeaningDensity(input: MeaningDensityInput): MeaningDensityScore {
  let score = 0;
  const reasons: string[] = [];

  if (input.directUserGoal) {
    score += 1;
    reasons.push("directly serves the stated goal");
  }
  if (input.truthContact) {
    score += 1;
    reasons.push("improves truth-contact or grounding");
  }
  if (input.userAgency) {
    score += 1;
    reasons.push("preserves or increases user agency");
  }
  if (input.relationshipCare) {
    score += 1;
    reasons.push("protects relational trust");
  }
  if (input.longHorizon) {
    score += 1;
    reasons.push("supports longer-range coherence");
  }
  if (input.irreversibleAction) {
    score += 0.5;
    reasons.push("has irreversible weight, so preflight matters more");
  }
  if (input.collapseRisk) {
    score += 0.5;
    reasons.push("could reduce looping or overload if handled well");
  }
  if (input.decorativeRisk) {
    score -= 1.5;
    reasons.push("risks decorative output without durable value");
  }

  const rounded = clampScore(score / 1.5);
  const verdict: MeaningDensityScore["verdict"] =
    rounded >= 3 ? "high" : rounded >= 2 ? "medium" : "low";
  return { score: rounded, verdict, reasons };
}

export function recommendResponseMode(input: ResponseModeInput): ResponseMode {
  if (input.relationalStrain) {
    return "repair";
  }
  if (input.collapseRisk) {
    return "agency_first";
  }
  if ((input.repeatedFailures ?? 0) >= 2) {
    return "agency_first";
  }
  if (input.userUncertainty) {
    return "agency_first";
  }
  if (input.irreversibleAction) {
    return "agency_first";
  }
  if (input.asksForDelegation) {
    return "tight_execute";
  }
  return "tight_execute";
}

export function shouldOpenRepairLoop(signals: RepairLoopSignals): boolean {
  if (signals.mismatch === "clear") {
    return true;
  }
  const booleans = [
    signals.userFriction,
    signals.assistantOverreach,
    signals.confidenceDrop,
  ].filter(Boolean).length;
  return booleans >= 2;
}

export function buildFlourishingPromptSection(config?: FlourishingPromptConfig): string[] {
  if (!config?.enabled) {
    return [];
  }

  const lines = [
    "## Flourishing Response Shaping",
    "Before acting, prefer the smallest move that increases truth, agency, and relationship quality together.",
  ];

  if (config.meaningDensity?.enabled) {
    const minScore = clampScore(config.meaningDensity.executionMinScore ?? 2);
    lines.push(
      `- Meaning-density preflight: before irreversible or tool-using execution, quickly check whether the next move scores at least ${minScore}/3 on direct usefulness, truth-contact, agency protection, and relational value.`,
      "- If it scores below threshold, narrow the move: ask the key clarifying question, reduce scope, or present a smaller reversible step instead of performing decorative work.",
    );
  }

  if (config.responseMode?.enabled) {
    const defaultMode = config.responseMode.defaultMode ?? "agency_first";
    const collapseThreshold = Math.max(1, config.responseMode.collapseFailureThreshold ?? 2);
    lines.push(
      `- Default response mode: ${defaultMode.replace("_", "-")}.`,
      "- Agency-first mode means: state the situation plainly, offer 1-3 concrete options or the smallest next step, and avoid over-driving the user with too many branches.",
      "- Tight-execute mode means: when intent is clear and reversible, do the work directly and report concrete receipts.",
      `- Switch into agency-first mode when there is confusion, repeated failure (>= ${collapseThreshold}), irreversible weight, or signs of overwhelm.`,
    );
  }

  if (config.repairLoop?.enabled) {
    lines.push(
      "- Repair-loop hook: if the interaction shows strain, overreach, or mismatch, stop escalating and briefly repair.",
      "- Repair shape: name the mismatch in one sentence, own the likely miss, restate the user's apparent aim, and offer one corrected next step.",
      "- Do not use repair language as theatre; only invoke it when it changes the next move.",
    );
  }

  lines.push("");
  return lines;
}
