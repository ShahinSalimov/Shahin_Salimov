import type { Asset, Change, UpdateProposal } from "../workspace/model";

export interface InstructionRow {
  reference: string;
  asset: string;
  assetType: string;
  location: string;
  change: string;
  currentValue: string;
  newValue: string;
  instruction: string;
  impact: string;
  approval: string;
  execution: string;
}

export function instructionRows(proposals: UpdateProposal[], assets: Asset[], changes: Change[]): InstructionRow[] {
  const a = new Map(assets.map((x) => [x.id, x]));
  const c = new Map(changes.map((x) => [x.id, x]));
  return proposals.map((p) => {
    const asset = a.get(p.targetAssetId);
    const found = p.evidence.find((e) => e.label === "Found at")?.detail;
    return {
      reference: (p.idempotencyKey ?? p.id).slice(0, 12),
      asset: asset?.name ?? "Deleted asset",
      assetType: asset?.type ?? "",
      location: [asset?.sourceUrl, found].filter(Boolean).join(" · "),
      change: c.get(p.changeId)?.title ?? "",
      currentValue: p.currentValue ?? "",
      newValue: p.proposedValue ?? "",
      instruction: p.reason ?? "",
      impact: p.impactLevel,
      approval: p.approvalStatus,
      execution: p.executionStatus,
    };
  });
}

const COLUMNS: [keyof InstructionRow, string][] = [
  ["reference", "Reference"],
  ["asset", "Asset"],
  ["assetType", "Type"],
  ["location", "Location"],
  ["change", "Change"],
  ["currentValue", "Current value"],
  ["newValue", "New value"],
  ["instruction", "Instruction"],
  ["impact", "Impact"],
  ["approval", "Approval"],
  ["execution", "Execution"],
];

/** Spreadsheet apps execute cells starting with = + - @ (and tab/CR): prefix them so they stay text. */
export function csvCell(value: string): string {
  let v = value.replace(/\r?\n/g, " ");
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",;]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: InstructionRow[]): string {
  const header = COLUMNS.map(([, h]) => h).join(",");
  return `\uFEFF${[header, ...rows.map((r) => COLUMNS.map(([k]) => csvCell(r[k])).join(","))].join("\r\n")}\r\n`;
}

function md(v: string): string {
  return v.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ").replace(/[<>]/g, (ch) => (ch === "<" ? "&lt;" : "&gt;"));
}

export function toMarkdown(rows: InstructionRow[], title: string, generatedAt: string): string {
  const lines = [`# ${md(title)}`, "", `Generated ${generatedAt}. ${rows.length} update${rows.length === 1 ? "" : "s"}. CHANGEMESH did not change any external system; apply each update and mark it as applied.`, ""];
  rows.forEach((r, i) => {
    lines.push(`## ${i + 1}. ${md(r.asset)}`, "");
    lines.push(`- **Change:** ${md(r.change)}`);
    if (r.location) lines.push(`- **Where:** ${md(r.location)}`);
    lines.push(`- **Current → new:** ${md(r.currentValue || "—")} → **${md(r.newValue || "—")}**`);
    lines.push(`- **Instruction:** ${md(r.instruction)}`);
    lines.push(`- **Impact:** ${r.impact} · **Approval:** ${r.approval} · **Execution:** ${r.execution} · **Reference:** \`${r.reference}\``, "");
  });
  return lines.join("\n");
}
