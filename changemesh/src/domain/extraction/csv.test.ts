import { describe, expect, it } from "vitest";
import { analyzeCsv } from "./csv";

const PRICES = `Item,Category,Price,Available,Updated
Classic Burger,Mains,$15.00,yes,2026-11-10
Pumpkin Risotto,Mains,$19.00,yes,2026-10-01
Truffle Fries,Sides,$8.50,no,2026-09-15
`;

describe("analyzeCsv", () => {
  it("detects header, column types and the entity column", () => {
    const r = analyzeCsv(PRICES, { assetName: "Prices" });
    expect(r.hasHeader).toBe(true);
    expect(r.delimiter).toBe(",");
    expect(r.columns.map((c) => [c.name, c.type])).toEqual([
      ["Item", "text"],
      ["Category", "text"],
      ["Price", "currency"],
      ["Available", "boolean"],
      ["Updated", "date"],
    ]);
    expect(r.entityColumn).toBe("Item");
    expect(r.entityKind).toBe("Products");
    expect(r.entityCount).toBe(3);
    expect(r.rowCount).toBe(3);
  });

  it("turns cells into normalized facts with row and column locations", () => {
    const r = analyzeCsv(PRICES, { assetName: "Prices" });
    expect(r.facts).toHaveLength(12);
    const burger = r.facts.find((f) => f.entityName === "Classic Burger" && f.attributeName === "price");
    expect(burger).toMatchObject({ normalizedValue: "USD 15.00", valueNumber: 15, valueUnit: "USD", confidence: 0.9, method: "csv" });
    expect(burger?.location).toMatchObject({ kind: "row", row: 2, column: "Price" });
  });

  it("supports semicolon delimiters and decimal commas", () => {
    const r = analyzeCsv("Product;Price\nTea;4,50 AZN\nCoffee;6,00 AZN\n", { assetName: "x" });
    expect(r.delimiter).toBe(";");
    expect(r.facts.map((f) => f.normalizedValue)).toEqual(["AZN 4.50", "AZN 6.00"]);
  });

  it("skips malformed rows and reports their line numbers", () => {
    const r = analyzeCsv("Name,Price\nA,$1\nB,$2,extra\nC,$3\n", { assetName: "x" });
    expect(r.malformedRows).toEqual([3]);
    expect(r.validRows).toBe(2);
    expect(r.warnings.join(" ")).toMatch(/1 row\(s\).*lines 3/);
  });

  it("works without a header row", () => {
    const r = analyzeCsv("Burger,12\nRisotto,19\n", { assetName: "x" });
    expect(r.hasHeader).toBe(false);
    expect(r.columns.map((c) => c.name)).toEqual(["Column 1", "Column 2"]);
    expect(r.entityColumn).toBe("Column 1");
  });

  it("flags formula-like cells and stores them as text", () => {
    const r = analyzeCsv('Name,Note\nA,"=HYPERLINK(""http://evil"")"\nB,@SUM(1)\n', { assetName: "x" });
    expect(r.warnings.join(" ")).toMatch(/2 cell\(s\) start with a formula character/);
    expect(r.facts[0]!.valueText.startsWith("=HYPERLINK")).toBe(true);
  });

  it("caps facts and reports truncation", () => {
    const rows = Array.from({ length: 30 }, (_, i) => `Item ${i},${i},${i * 2}`).join("\n");
    const r = analyzeCsv(`Name,A,B\n${rows}`, { assetName: "x", maxFacts: 10 });
    expect(r.facts).toHaveLength(10);
    expect(r.truncated).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/50 facts were not saved/);
  });

  it("handles empty input", () => {
    const r = analyzeCsv("", { assetName: "x" });
    expect(r.facts).toEqual([]);
    expect(r.warnings).toContain("The file contains no rows.");
  });
});
