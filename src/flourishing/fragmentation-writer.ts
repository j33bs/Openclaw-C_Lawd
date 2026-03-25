import fs from "node:fs/promises";
import path from "node:path";
import { assessFragmentation, type AntiFragmentationAssessment } from "./anti-fragmentation.js";
import { collectFragmentationSignals } from "./fragmentation-collector.js";

const BRISBANE_TIME_ZONE = "Australia/Brisbane";

export async function writeFragmentationAssessment(workspaceDir: string): Promise<void> {
  try {
    const signal = await collectFragmentationSignals(workspaceDir);
    const assessment = assessFragmentation(signal);
    const collectedAt = new Date().toISOString();
    const payload = {
      collectedAt,
      signal,
      ...assessment,
    };

    const statePath = path.join(
      workspaceDir,
      "workspace",
      "state",
      "fragmentation-assessment.json",
    );
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    if (assessment.severity === "high" || assessment.severity === "critical") {
      await appendWarningToDailyNote(workspaceDir, assessment);
    }
  } catch {
    return;
  }
}

async function appendWarningToDailyNote(
  workspaceDir: string,
  assessment: AntiFragmentationAssessment,
): Promise<void> {
  const today = formatDateInTimeZone(new Date(), BRISBANE_TIME_ZONE);
  const dailyNotePath = path.join(workspaceDir, "memory", `${today}.md`);
  const warningBlock = [
    "",
    "## Fragmentation Warning",
    `- Severity: ${assessment.severity}`,
    `- Score: ${assessment.score}`,
    assessment.recommendations[0] ? `- Recommendation: ${assessment.recommendations[0]}` : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await fs.appendFile(dailyNotePath, warningBlock, "utf8");
  } catch {
    await fs.mkdir(path.dirname(dailyNotePath), { recursive: true });
    await fs.writeFile(dailyNotePath, `# ${today}\n${warningBlock}\n`, "utf8");
  }
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}
