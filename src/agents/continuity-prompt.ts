import type { ContinuityBundle } from "../memory/continuity-bundle.js";

function excerptMarkdown(value: string, maxTokens: number): string {
  const limit = Math.max(1, Math.floor(maxTokens));
  const lines = value.split(/\r?\n/u);
  const out: string[] = [];
  let used = 0;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      if (out.length > 0 && out[out.length - 1] !== "") {
        out.push("");
      }
      continue;
    }
    const words = line.trim().split(/\s+/u);
    if (used + words.length <= limit) {
      out.push(line.trim());
      used += words.length;
      continue;
    }
    const remaining = Math.max(0, limit - used);
    if (remaining <= 0) {
      break;
    }
    out.push(`${words.slice(0, remaining).join(" ")} ...`);
    used = limit;
    break;
  }
  return out.join("\n").trim();
}

function oneLineExcerpt(value: string, maxTokens: number): string {
  const cleaned = value.replace(/\s+/gu, " ").trim();
  if (!cleaned) {
    return "";
  }
  const words = cleaned.split(" ");
  const limit = Math.max(1, Math.floor(maxTokens));
  return words.length <= limit ? cleaned : `${words.slice(0, limit).join(" ")} ...`;
}

function formatLabel(entry: ContinuityBundle["entries"][number]): string {
  if (entry.kind === "daily-note") {
    return entry.date ? `Today (${entry.date})` : "Today";
  }
  if (entry.kind === "pinned-doctrine") {
    return entry.source;
  }
  return entry.source;
}

export function buildContinuityPromptSection(bundle: ContinuityBundle): string {
  if (bundle.confidence === "minimal" || bundle.entries.length === 0) {
    return [
      "## Recent Context [confidence: minimal]",
      "Recent daily notes and pinned doctrine were not found. State uncertainty explicitly when answering questions about recent work.",
    ].join("\n");
  }

  const today = bundle.entries.find((entry) => entry.kind === "daily-note" && entry.date);
  const yesterday = bundle.entries
    .filter((entry) => entry.kind === "daily-note")
    .find((entry) => entry.date && entry.date !== today?.date);
  const pinned = bundle.entries.filter((entry) => entry.kind === "pinned-doctrine");
  const related = bundle.entries.filter((entry) => entry.kind === "session-snippet");

  const lines = [`## Recent Context [confidence: ${bundle.confidence}]`];

  if (today) {
    lines.push("", `### Today (${today.date ?? ""})`.trim(), excerptMarkdown(today.content, 135));
  }

  if (yesterday) {
    lines.push(
      "",
      `### Yesterday (${yesterday.date ?? ""})`.trim(),
      excerptMarkdown(yesterday.content, 90),
    );
  }

  if (pinned.length > 0) {
    lines.push(
      "",
      "### Active Doctrine",
      excerptMarkdown(
        pinned.map((entry) => `Source: ${entry.source}\n${entry.content}`).join("\n\n"),
        90,
      ),
    );
  }

  if (related.length > 0) {
    lines.push("", "### Related Sessions");
    for (const entry of related.slice(0, 2)) {
      const label = formatLabel(entry);
      const snippet = oneLineExcerpt(entry.content, 20);
      const score = typeof entry.score === "number" ? ` (score ${entry.score.toFixed(2)})` : "";
      lines.push(`- ${label}${score}: ${snippet}`);
    }
  }

  return lines.join("\n").trim();
}
