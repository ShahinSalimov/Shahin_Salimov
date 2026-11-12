import { makeFact, type ExtractionMethod, type SourceLocation } from "@/domain/extraction/fact";
import type { Asset, AssetScan, AssetVersion, ExtractedFact } from "@/domain/workspace/model";

/**
 * Sample extracted facts for the demo workspace. They tell the same story as
 * the demo changes: the price list already says $15, while the website menu,
 * the printed menu and the ordering page still say $12; Harborside's phone
 * number differs between the website and the location record.
 */
type Row = [entity: string, attribute: string, value: string, location: SourceLocation, confidence: number, method: ExtractionMethod];

export function buildDemoIntelligence(assets: Asset[], now: Date, existingVersions: AssetVersion[] = []): { facts: ExtractedFact[]; scans: AssetScan[]; versions: AssetVersion[] } {
  const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000).toISOString();
  const byId = new Map(assets.map((a) => [a.id, a]));
  const facts: ExtractedFact[] = [];
  const scans: AssetScan[] = [];

  const add = (assetId: string, rows: Row[], manual = false) => {
    const asset = byId.get(assetId);
    if (!asset) return;
    rows.forEach(([entity, attribute, value, location, confidence, method], i) => {
      const f = makeFact(entity, attribute, value, location, confidence, method);
      if (!f) return;
      facts.push({
        id: `f-${assetId}-${i}`,
        assetId,
        assetVersion: manual ? null : asset.currentVersion,
        scanId: manual ? null : `s-${assetId}-ok`,
        entityName: f.entityName,
        attributeName: f.attributeName,
        valueText: f.valueText,
        valueNumber: f.valueNumber,
        valueUnit: f.valueUnit,
        normalizedValue: f.normalizedValue,
        location: f.location,
        confidence: f.confidence,
        method: f.method,
        origin: "demo",
        extractedAt: asset.lastScannedAt ?? asset.createdAt,
      });
    });
  };
  const row = (r: number, column: string): SourceLocation => ({ kind: "row", row: r, column });
  const el = (path: string, snippet?: string): SourceLocation => ({ kind: "element", path, snippet });
  const page = (p: number, line: number, snippet?: string): SourceLocation => ({ kind: "page", page: p, line, snippet });

  const priceList: [string, string, string, string][] = [
    ["Classic Burger", "Mains", "$15.00", "yes"],
    ["Pumpkin Risotto", "Mains", "$19.00", "yes"],
    ["Grilled Salmon", "Mains", "$24.00", "yes"],
    ["Caesar Salad", "Starters", "$11.00", "yes"],
    ["Truffle Fries", "Sides", "$8.50", "no"],
    ["Sweet Potato Fries", "Sides", "$6.50", "yes"],
    ["Lemon Tart", "Desserts", "$9.00", "yes"],
  ];
  add(
    "a-price-csv",
    priceList.flatMap(([item, cat, price, avail], i): Row[] => [
      [item, "category", cat, row(i + 2, "Category"), 0.9, "csv"],
      [item, "price", price, row(i + 2, "Price"), 0.9, "csv"],
      [item, "available", avail, row(i + 2, "Available"), 0.9, "csv"],
    ]),
  );
  add("a-menu-page", [
    ["Harbor & Vine — Menu", "page title", "Harbor & Vine — Menu", { kind: "meta", path: "title" }, 0.95, "html"],
    ["Classic Burger", "price", "$12.00", { kind: "json_ld", path: "ld[0].@graph[1].offers.price" }, 0.95, "json_ld"],
    ["Pumpkin Risotto", "price", "$19.00", el("main > ul > li:nth-of-type(2)", "Pumpkin Risotto $19.00"), 0.7, "html"],
    ["Grilled Salmon", "price", "$24.00", el("main > ul > li:nth-of-type(3)", "Grilled Salmon $24.00"), 0.7, "html"],
    ["Truffle Fries", "price", "$8.50", el("main > ul > li:nth-of-type(5)", "Truffle Fries $8.50"), 0.7, "html"],
  ]);
  add("a-home", [
    ["Harbor & Vine", "page title", "Harbor & Vine — Seasonal kitchen by the harbor", { kind: "meta", path: "title" }, 0.95, "html"],
    ["Harbor & Vine", "phone", "+1 555 0100", { kind: "link", path: "footer > a" }, 0.9, "html"],
    ["Harbor & Vine", "email", "hello@harborvine.example", { kind: "link", path: "footer > a:nth-of-type(2)" }, 0.9, "html"],
  ]);
  add("a-locations", [
    ["Harbor & Vine Downtown", "opening hours", "Mon–Sun 11:00–22:00", { kind: "json_ld", path: "ld[0].@graph[0].openingHours" }, 0.95, "json_ld"],
    ["Harbor & Vine Downtown", "address", "1 Pier St, Harbor City", { kind: "json_ld", path: "ld[0].@graph[0].address" }, 0.95, "json_ld"],
    ["Harbor & Vine Harborside", "phone", "+1 555 0124", { kind: "json_ld", path: "ld[0].@graph[1].telephone" }, 0.95, "json_ld"],
    ["Harbor & Vine Harborside", "opening hours", "Tue–Sun 12:00–22:00", { kind: "json_ld", path: "ld[0].@graph[1].openingHours" }, 0.95, "json_ld"],
  ]);
  add("a-order", [
    ["Classic Burger", "price", "$12.00", el("div#cart > ul > li", "Classic Burger $12.00"), 0.7, "html"],
    ["Pumpkin Risotto", "price", "$19.00", el("div#cart > ul > li:nth-of-type(2)", "Pumpkin Risotto $19.00"), 0.7, "html"],
  ]);
  add("a-dinner-pdf", [
    ["Classic Burger", "price", "$12.00", page(2, 4, "Classic Burger ........ $12.00"), 0.7, "pdf_text"],
    ["Pumpkin Risotto", "price", "$19.00", page(2, 6, "Pumpkin Risotto ........ $19.00"), 0.7, "pdf_text"],
    ["Grilled Salmon", "price", "$24.00", page(2, 8, "Grilled Salmon ........ $24.00"), 0.7, "pdf_text"],
    ["Lemon Tart", "price", "$9.00", page(3, 2, "Lemon Tart ........ $9.00"), 0.7, "pdf_text"],
  ]);
  add("a-catering-pdf", [
    ["Mini Burger Platter (12)", "price", "$48.00", page(1, 5, "Mini Burger Platter (12) $48.00"), 0.6, "pdf_text"],
    ["Risotto Bites (24)", "price", "$36.00", page(2, 3, "Risotto Bites (24) $36.00"), 0.6, "pdf_text"],
  ]);
  add("a-wholesale", [
    ["Truffle Fries", "availability", "Available", page(7, 12, "Truffle Fries — Available — case of 6"), 0.6, "pdf_text"],
    ["Classic Burger Patty", "price", "$9.50", page(4, 3, "Classic Burger Patty (case) $9.50"), 0.6, "pdf_text"],
  ]);
  add("a-campaign", [["Burgers", "price", "$12", page(3, 1, "Burgers from $12 — this autumn only"), 0.6, "pdf_text"]]);
  add(
    "a-loc-downtown",
    [
      ["Downtown location", "opening hours", "Mon–Sun 11:00–23:00", { kind: "manual" }, 1, "manual"],
      ["Downtown location", "phone", "+1 555 0100", { kind: "manual" }, 1, "manual"],
      ["Downtown location", "address", "1 Pier St, Harbor City", { kind: "manual" }, 1, "manual"],
    ],
    true,
  );
  add(
    "a-loc-harbor",
    [
      ["Harborside location", "phone", "+1 555 0142", { kind: "manual" }, 1, "manual"],
      ["Harborside location", "opening hours", "Tue–Sun 12:00–22:00", { kind: "manual" }, 1, "manual"],
    ],
    true,
  );

  // Scan history: the latest scan matches each asset's status and error.
  for (const a of assets) {
    if (a.type === "manual" || a.scanStatus === "not_scanned") continue;
    const count = facts.filter((f) => f.assetId === a.id && f.assetVersion !== null).length;
    const kind = a.type === "website" ? "website" : "upload";
    if (a.scanStatus === "failed") {
      scans.push({ id: `s-${a.id}-fail`, assetId: a.id, kind, status: "failed", startedAt: a.lastScannedAt ?? ago(3), finishedAt: a.lastScannedAt ?? ago(3), assetVersion: null, factsCount: 0, error: a.lastScanError, warnings: [], stats: {} });
    }
    if (a.currentVersion > 0) {
      scans.push({
        id: `s-${a.id}-ok`,
        assetId: a.id,
        kind,
        status: a.scanStatus === "partial" ? "partial" : "succeeded",
        startedAt: a.scanStatus === "failed" ? ago(50) : (a.lastScannedAt ?? ago(6)),
        finishedAt: a.scanStatus === "failed" ? ago(50) : (a.lastScannedAt ?? ago(6)),
        assetVersion: a.currentVersion,
        factsCount: count,
        error: a.scanStatus === "partial" ? a.lastScanError : null,
        warnings: a.scanStatus === "partial" && a.lastScanError ? [a.lastScanError] : [],
        stats: { sample: true },
      });
    }
  }
  // Version records with a content summary for every scanned asset (the base seed only has a few).
  const versions: AssetVersion[] = [];
  const summaries: Record<string, Record<string, unknown>> = {
    "a-menu-page": { kind: "website", url: "https://harborvine.example/menu", title: "Harbor & Vine — Menu", lang: "en", headings: [{ level: 1, text: "Our menu" }, { level: 2, text: "Mains" }, { level: 2, text: "Sides" }, { level: 2, text: "Desserts" }], textExcerpt: "Our menu\nMains\nClassic Burger ........ $12.00\nPumpkin Risotto ........ $19.00\nGrilled Salmon ........ $24.00\nSides\nTruffle Fries ........ $8.50" },
    "a-home": { kind: "website", url: "https://harborvine.example/", title: "Harbor & Vine — Seasonal kitchen by the harbor", lang: "en", headings: [{ level: 1, text: "Seasonal kitchen by the harbor" }, { level: 2, text: "Three locations" }] },
    "a-locations": { kind: "website", url: "https://harborvine.example/locations", title: "Locations & hours — Harbor & Vine", lang: "en", headings: [{ level: 1, text: "Locations" }, { level: 2, text: "Downtown" }, { level: 2, text: "Harborside" }, { level: 2, text: "Uptown" }] },
    "a-order": { kind: "website", url: "https://order.harborvine.example/downtown", title: "Order online — Downtown", headings: [{ level: 1, text: "Order for pickup" }] },
    "a-dinner-pdf": { kind: "pdf", fileName: "Dinner menu — Fall 2026.pdf", pages: 4, pagesRead: 4, emptyPages: [], textExcerpt: "HARBOR & VINE\nDinner\n\nClassic Burger ........ $12.00\nPumpkin Risotto ........ $19.00\nGrilled Salmon ........ $24.00" },
    "a-catering-pdf": { kind: "pdf", fileName: "Catering menu.pdf", pages: 4, pagesRead: 4, emptyPages: [3, 4], textExcerpt: "Catering\nMini Burger Platter (12) $48.00\nRisotto Bites (24) $36.00" },
    "a-price-csv": {
      kind: "csv", fileName: "Master price list.csv", rows: 7, validRows: 7, hasHeader: true, delimiter: ",", entityColumn: "Item", entityKind: "Menu items", entityCount: 7,
      columns: [
        { name: "Item", type: "text", filled: 7, unique: 7, sample: ["Classic Burger", "Pumpkin Risotto", "Grilled Salmon"] },
        { name: "Category", type: "text", filled: 7, unique: 4, sample: ["Mains", "Starters", "Sides"] },
        { name: "Price", type: "currency", filled: 7, unique: 7, sample: ["$15.00", "$19.00", "$24.00"] },
        { name: "Available", type: "boolean", filled: 7, unique: 2, sample: ["yes", "no"] },
      ],
    },
    "a-wholesale": { kind: "pdf", fileName: "Wholesale catalog 2026.pdf", pages: 12, pagesRead: 12, emptyPages: [] },
    "a-campaign": { kind: "pdf", fileName: "Autumn campaign deck.pdf", pages: 6, pagesRead: 6, emptyPages: [] },
  };
  for (const a of assets) {
    if (a.currentVersion < 1 || existingVersions.some((v) => v.assetId === a.id && v.version === a.currentVersion)) continue;
    versions.push({ id: `v-${a.id}-${a.currentVersion}`, assetId: a.id, version: a.currentVersion, contentHash: `sha256:demo-${a.id}`, summary: { ...(summaries[a.id] ?? {}), note: "Sample content summary" }, createdAt: a.lastScannedAt ?? a.updatedAt });
  }
  return { facts, scans, versions };
}
