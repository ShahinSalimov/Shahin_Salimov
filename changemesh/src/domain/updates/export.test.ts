import { describe, expect, it } from "vitest";
import { csvCell, instructionRows, toCsv, toMarkdown } from "./export";

const proposal = { id: "p1", changeId: "c1", targetAssetId: "a1", currentValue: "$12", proposedValue: "$15", reason: "Replace, then reprint", evidence: [{ label: "Found at", detail: "Page 2" }], impactLevel: "high", approvalStatus: "approved", executionStatus: "ready", idempotencyKey: "abcdef1234567890" } as never;
const rows = instructionRows([proposal], [{ id: "a1", name: "Menu | PDF", type: "pdf", sourceUrl: null }] as never, [{ id: "c1", title: "Burger price" }] as never);

describe("update instruction export", () => {
  it("builds rows with location and a short reference", () => {
    expect(rows[0]).toMatchObject({ reference: "abcdef123456", asset: "Menu | PDF", location: "Page 2", currentValue: "$12", newValue: "$15" });
  });
  it("neutralizes spreadsheet formulas and quotes separators", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("plain")).toBe("plain");
    const csv = toCsv(rows);
    expect(csv.startsWith("\uFEFFReference,Asset")).toBe(true);
    expect(csv).toContain('"Replace, then reprint"');
  });
  it("escapes markdown tables and HTML", () => {
    const out = toMarkdown(rows, "Updates <script>", "2026-11-12");
    expect(out).toContain("# Updates &lt;script&gt;");
    expect(out).toContain("## 1. Menu \\| PDF");
    expect(out).toContain("$12 → **$15**");
  });
});
