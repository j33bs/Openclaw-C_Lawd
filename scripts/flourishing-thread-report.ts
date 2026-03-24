import { readFile } from "node:fs/promises";
import process from "node:process";
import { buildThreadContinuityReport } from "../src/flourishing/thread-continuity.js";

type Payload = {
  snapshot: unknown;
  novelty: unknown;
  fragmentation: unknown;
};

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node --import tsx scripts/flourishing-thread-report.ts <input.json>");
    process.exitCode = 1;
    return;
  }

  const raw = await readFile(inputPath, "utf8");
  const payload = JSON.parse(raw) as Payload;
  const report = buildThreadContinuityReport({
    snapshot: payload.snapshot,
    novelty: payload.novelty,
    fragmentation: payload.fragmentation,
  });

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
