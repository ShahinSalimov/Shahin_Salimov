import type {
  Approval,
  Asset,
  AssetRelationship,
  AssetVersion,
  AuditEvent,
  Change,
  ChangeImpact,
  Member,
  UpdateProposal,
  WorkspaceSnapshot,
} from "@/domain/workspace/model";

/**
 * Fictional demo workspace: "Harbor & Vine", a restaurant group with three
 * locations. Every record has origin "demo" and is labeled as sample data in
 * the UI. Dates are relative to `now` so the demo always looks current.
 * Integrations are intentionally NOT connected: we never fake a connection.
 */
export function buildDemoSnapshot(now: Date = new Date()): WorkspaceSnapshot {
  const ago = (days: number, hours = 0) => new Date(now.getTime() - (days * 24 + hours) * 3600_000).toISOString();

  const asset = (id: string, a: Partial<Asset> & Pick<Asset, "type" | "name">): Asset => ({
    id,
    description: null,
    sourceUrl: null,
    mimeType: null,
    sizeBytes: null,
    status: "active",
    scanStatus: "succeeded",
    lastScannedAt: ago(0, 6),
    lastScanError: null,
    currentVersion: 1,
    isCustomerFacing: true,
    origin: "demo",
    createdAt: ago(40),
    updatedAt: ago(1),
    ...a,
  });

  const assets: Asset[] = [
    asset("a-menu-page", { type: "website", name: "Website — Menu page", sourceUrl: "https://harborvine.example/menu", mimeType: "text/html", currentVersion: 6, description: "Public menu with prices for all three locations." }),
    asset("a-home", { type: "website", name: "Website — Homepage", sourceUrl: "https://harborvine.example/", mimeType: "text/html", currentVersion: 4 }),
    asset("a-locations", { type: "website", name: "Website — Locations & hours", sourceUrl: "https://harborvine.example/locations", mimeType: "text/html", currentVersion: 5 }),
    asset("a-order", {
      type: "website",
      name: "Online ordering page",
      sourceUrl: "https://order.harborvine.example/downtown",
      mimeType: "text/html",
      scanStatus: "failed",
      lastScannedAt: ago(0, 3),
      lastScanError: "Request timed out after 10 s. The page was not analyzed; previous version (v3) is still shown.",
      currentVersion: 3,
    }),
    asset("a-dinner-pdf", { type: "pdf", name: "Dinner menu — Fall 2026.pdf", mimeType: "application/pdf", sizeBytes: 1_842_311, currentVersion: 2, description: "Printed in-store menu, 4 pages." }),
    asset("a-catering-pdf", {
      type: "pdf",
      name: "Catering menu.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3_120_884,
      scanStatus: "partial",
      lastScanError: "Pages 3–4 contain only images; no text could be extracted from them. Prices on those pages were not analyzed.",
    }),
    asset("a-allergen-pdf", { type: "pdf", name: "Allergen guide.pdf", mimeType: "application/pdf", sizeBytes: 402_115, scanStatus: "not_scanned", lastScannedAt: null, currentVersion: 1 }),
    asset("a-price-csv", { type: "csv", name: "Master price list.csv", mimeType: "text/csv", sizeBytes: 18_230, currentVersion: 4, isCustomerFacing: false, description: "Source of truth for prices, maintained by Operations." }),
    asset("a-pos-csv", {
      type: "csv",
      name: "POS item export.csv",
      mimeType: "text/csv",
      sizeBytes: 96_004,
      isCustomerFacing: false,
      scanStatus: "failed",
      lastScanError: "Row 212 has 14 columns but the header defines 9. Import stopped; no records from this file were saved.",
    }),
    asset("a-wholesale", { type: "product_catalog", name: "Wholesale catalog 2026", mimeType: "application/pdf", sizeBytes: 5_400_120, currentVersion: 3, isCustomerFacing: true }),
    asset("a-campaign", { type: "marketing_content", name: "Autumn campaign — Instagram copy deck", mimeType: "application/pdf", sizeBytes: 2_004_512, currentVersion: 2 }),
    asset("a-gbp", { type: "marketing_content", name: "Google Business Profile — Downtown description", scanStatus: "not_scanned", lastScannedAt: null }),
    asset("a-newsletter", { type: "marketing_content", name: "November newsletter draft", scanStatus: "not_scanned", lastScannedAt: null, createdAt: ago(3) }),
    asset("a-loc-downtown", { type: "manual", name: "Location record — Downtown", isCustomerFacing: false, scanStatus: "not_scanned", lastScannedAt: null, description: "Hours, phone and address entered by Operations." }),
    asset("a-loc-harbor", { type: "manual", name: "Location record — Harborside", isCustomerFacing: false, scanStatus: "not_scanned", lastScannedAt: null }),
  ];

  const rel = (id: string, source: string, target: string, type: AssetRelationship["type"], status: AssetRelationship["status"], confidence: number, note: string | null = null): AssetRelationship => ({
    id,
    sourceAssetId: source,
    targetAssetId: target,
    type,
    status,
    confidence,
    origin: "demo",
    note,
    createdAt: ago(30),
  });

  const relationships: AssetRelationship[] = [
    rel("r1", "a-menu-page", "a-price-csv", "derived_from", "confirmed", 1),
    rel("r2", "a-dinner-pdf", "a-price-csv", "derived_from", "confirmed", 1),
    rel("r3", "a-wholesale", "a-price-csv", "derived_from", "confirmed", 0.92),
    rel("r4", "a-catering-pdf", "a-price-csv", "derived_from", "suggested", 0.74, "Sample suggestion: 23 of 31 item names match the price list."),
    rel("r5", "a-pos-csv", "a-price-csv", "syncs_with", "confirmed", 1),
    rel("r6", "a-order", "a-price-csv", "syncs_with", "confirmed", 0.95),
    rel("r7", "a-home", "a-menu-page", "links_to", "confirmed", 1),
    rel("r8", "a-home", "a-locations", "links_to", "confirmed", 1),
    rel("r9", "a-locations", "a-loc-downtown", "derived_from", "confirmed", 1),
    rel("r10", "a-locations", "a-loc-harbor", "derived_from", "confirmed", 1),
    rel("r11", "a-campaign", "a-dinner-pdf", "references", "suggested", 0.68, "Sample suggestion: the deck quotes 4 dishes and their prices from the dinner menu."),
    rel("r12", "a-gbp", "a-loc-downtown", "references", "suggested", 0.81, "Sample suggestion: same opening hours and phone number."),
    rel("r13", "a-allergen-pdf", "a-dinner-pdf", "references", "suggested", 0.55),
    rel("r14", "a-menu-page", "a-dinner-pdf", "duplicates", "rejected", 0.4, "Rejected: the website menu has fewer items than the printed menu."),
  ];

  const versions: AssetVersion[] = [
    ...[1, 2, 3, 4].map((v) => ({ id: `v-price-${v}`, assetId: "a-price-csv", version: v, contentHash: `sha256:demo${v}a91f`, summary: { rows: 120 + v * 3, note: v === 4 ? "Classic Burger 12.00 → 15.00" : "Imported" }, createdAt: ago(40 - v * 9) })),
    ...[1, 2].map((v) => ({ id: `v-dinner-${v}`, assetId: "a-dinner-pdf", version: v, contentHash: `sha256:demo${v}c22e`, summary: { pages: 4 }, createdAt: ago(35 - v * 10) })),
  ];

  const change = (id: string, c: Partial<Change> & Pick<Change, "title" | "type" | "status">): Change => ({
    id,
    description: null,
    sourceAssetId: null,
    entityName: null,
    attributeName: null,
    oldValue: null,
    newValue: null,
    origin: "demo",
    createdAt: ago(1),
    ...c,
  });

  const changes: Change[] = [
    change("c-burger", {
      title: "Classic Burger price $12.00 → $15.00",
      type: "updated",
      status: "pending_approval",
      sourceAssetId: "a-price-csv",
      entityName: "Classic Burger",
      attributeName: "price",
      oldValue: "$12.00",
      newValue: "$15.00",
      description: "Operations raised the Classic Burger price in the master price list (version 4).",
      createdAt: ago(1, 2),
    }),
    change("c-hours", {
      title: "Downtown opening hours extended to 23:00",
      type: "updated",
      status: "pending_approval",
      sourceAssetId: "a-loc-downtown",
      entityName: "Downtown location",
      attributeName: "opening hours",
      oldValue: "Mon–Sun 11:00–22:00",
      newValue: "Mon–Sun 11:00–23:00",
      createdAt: ago(3),
    }),
    change("c-phone", {
      title: "Harborside phone number differs between sources",
      type: "conflicting",
      status: "analyzed",
      sourceAssetId: "a-loc-harbor",
      entityName: "Harborside location",
      attributeName: "phone",
      oldValue: "+1 555 0124 (website)",
      newValue: "+1 555 0142 (location record)",
      description: "Two assets state different phone numbers for the same location.",
      createdAt: ago(5),
    }),
    change("c-truffle", {
      title: "Wholesale catalog still lists discontinued Truffle Fries",
      type: "outdated",
      status: "analyzed",
      sourceAssetId: "a-wholesale",
      entityName: "Truffle Fries",
      attributeName: "availability",
      oldValue: "Available",
      newValue: "Discontinued",
      createdAt: ago(6),
    }),
    change("c-risotto", {
      title: "Seasonal dish added: Pumpkin Risotto",
      type: "created",
      status: "completed",
      sourceAssetId: "a-price-csv",
      entityName: "Pumpkin Risotto",
      attributeName: "menu item",
      newValue: "$19.00",
      createdAt: ago(12),
    }),
    change("c-kids", {
      title: "Kids menu removed from Harborside",
      type: "deleted",
      status: "rejected",
      entityName: "Kids menu",
      attributeName: "availability",
      oldValue: "Available",
      newValue: "Removed",
      createdAt: ago(20),
    }),
  ];

  const impact = (
    changeId: string,
    assetId: string,
    level: ChangeImpact["level"],
    depth: number,
    path: ChangeImpact["path"],
    confidence: number,
    oldValue: string | null,
    newValue: string | null,
    recommendedAction: string,
  ): ChangeImpact => ({
    id: `i-${changeId}-${assetId}`,
    changeId,
    assetId,
    level,
    depth,
    path,
    oldValue,
    newValue,
    confidence,
    recommendedAction,
    origin: "demo",
    createdAt: changes.find((c) => c.id === changeId)!.createdAt,
  });

  const impacts: ChangeImpact[] = [
    impact("c-burger", "a-order", "critical", 1, [{ assetId: "a-price-csv", relationship: "contains" }, { assetId: "a-order", relationship: "syncs_with" }], 0.95, "$12.00", "$15.00", "Update the item price in the ordering system before the next service; customers are charged from this page."),
    impact("c-burger", "a-menu-page", "high", 1, [{ assetId: "a-price-csv", relationship: "contains" }, { assetId: "a-menu-page", relationship: "derived_from" }], 0.98, "$12.00", "$15.00", "Replace the price in the 'Burgers' section of the menu page."),
    impact("c-burger", "a-dinner-pdf", "high", 1, [{ assetId: "a-price-csv", relationship: "contains" }, { assetId: "a-dinner-pdf", relationship: "derived_from" }], 0.97, "$12.00", "$15.00", "Regenerate the printed menu (page 2) and replace in-store copies."),
    impact("c-burger", "a-pos-csv", "high", 1, [{ assetId: "a-price-csv", relationship: "contains" }, { assetId: "a-pos-csv", relationship: "syncs_with" }], 0.9, "$12.00", "$15.00", "Update the POS item. Note: the last POS export failed to import, so the current POS value is unverified."),
    impact("c-burger", "a-wholesale", "medium", 1, [{ assetId: "a-price-csv", relationship: "contains" }, { assetId: "a-wholesale", relationship: "derived_from" }], 0.86, "$12.00", "$15.00", "Review the wholesale price; wholesale may intentionally differ from retail."),
    impact("c-burger", "a-campaign", "medium", 2, [{ assetId: "a-price-csv", relationship: "contains" }, { assetId: "a-dinner-pdf", relationship: "derived_from" }, { assetId: "a-campaign", relationship: "references" }], 0.64, "Burgers from $12", "Burgers from $15", "Rewrite the campaign line that quotes the old price."),
    impact("c-burger", "a-catering-pdf", "low", 1, [{ assetId: "a-price-csv", relationship: "contains" }, { assetId: "a-catering-pdf", relationship: "derived_from" }], 0.52, "$12.00", "$15.00", "Confirm the suggested relationship first; pages 3–4 of this PDF could not be read."),
    impact("c-hours", "a-locations", "high", 1, [{ assetId: "a-loc-downtown", relationship: "contains" }, { assetId: "a-locations", relationship: "derived_from" }], 0.99, "11:00–22:00", "11:00–23:00", "Update Downtown hours on the locations page."),
    impact("c-hours", "a-gbp", "medium", 1, [{ assetId: "a-loc-downtown", relationship: "contains" }, { assetId: "a-gbp", relationship: "references" }], 0.81, "11:00–22:00", "11:00–23:00", "Update hours in Google Business Profile (manual step — no integration connected)."),
    impact("c-hours", "a-home", "low", 2, [{ assetId: "a-loc-downtown", relationship: "contains" }, { assetId: "a-locations", relationship: "derived_from" }, { assetId: "a-home", relationship: "links_to" }], 0.5, null, null, "Check the homepage footer, which may show opening hours."),
    impact("c-phone", "a-locations", "high", 1, [{ assetId: "a-loc-harbor", relationship: "contains" }, { assetId: "a-locations", relationship: "derived_from" }], 0.93, "+1 555 0124", "+1 555 0142", "Decide which number is correct, then correct the other source."),
    impact("c-truffle", "a-wholesale", "medium", 0, [{ assetId: "a-wholesale", relationship: "contains" }], 0.88, "Available", "Discontinued", "Remove Truffle Fries from page 7 of the wholesale catalog."),
    impact("c-risotto", "a-menu-page", "low", 1, [{ assetId: "a-price-csv", relationship: "contains" }, { assetId: "a-menu-page", relationship: "derived_from" }], 0.97, null, "$19.00", "Add the dish to the menu page."),
    impact("c-risotto", "a-dinner-pdf", "low", 1, [{ assetId: "a-price-csv", relationship: "contains" }, { assetId: "a-dinner-pdf", relationship: "derived_from" }], 0.97, null, "$19.00", "Add the dish to the printed menu."),
  ];

  const proposal = (impactId: string, p: Partial<UpdateProposal> = {}): UpdateProposal => {
    const i = impacts.find((x) => x.id === impactId)!;
    return {
      id: `p-${impactId.slice(2)}`,
      changeId: i.changeId,
      changeImpactId: i.id,
      targetAssetId: i.assetId,
      currentValue: i.oldValue,
      proposedValue: i.newValue,
      reason: i.recommendedAction,
      evidence: [
        { label: "Source", detail: changes.find((c) => c.id === i.changeId)!.title },
        { label: "Relationship path", detail: `${i.path.length - 1} hop(s), confidence ${Math.round(i.confidence * 100)}%` },
      ],
      impactLevel: i.level,
      approvalStatus: "pending",
      executionStatus: "not_started",
      origin: "demo",
      createdAt: i.createdAt,
      updatedAt: i.createdAt,
      ...p,
    };
  };

  const proposals: UpdateProposal[] = [
    proposal("i-c-burger-a-order"),
    proposal("i-c-burger-a-menu-page", { approvalStatus: "approved", updatedAt: ago(0, 20) }),
    proposal("i-c-burger-a-dinner-pdf"),
    proposal("i-c-burger-a-pos-csv"),
    proposal("i-c-burger-a-wholesale"),
    proposal("i-c-burger-a-campaign", { approvalStatus: "needs_revision", updatedAt: ago(0, 18) }),
    proposal("i-c-hours-a-locations"),
    proposal("i-c-hours-a-gbp"),
    proposal("i-c-phone-a-locations"),
    proposal("i-c-truffle-a-wholesale"),
    proposal("i-c-risotto-a-menu-page", { approvalStatus: "approved", executionStatus: "completed", updatedAt: ago(11) }),
    proposal("i-c-risotto-a-dinner-pdf", { approvalStatus: "approved", executionStatus: "completed", updatedAt: ago(11) }),
  ];

  const approvals: Approval[] = [
    { id: "ap-1", proposalId: "p-c-burger-a-menu-page", decision: "approved", comment: null, decidedBy: "demo-user-2", decidedByName: "Maya Chen", createdAt: ago(0, 20) },
    { id: "ap-2", proposalId: "p-c-burger-a-campaign", decision: "needs_revision", comment: "Keep the 'from' wording but check the new price with Marketing first.", decidedBy: "demo-user-2", decidedByName: "Maya Chen", createdAt: ago(0, 18) },
    { id: "ap-3", proposalId: "p-c-risotto-a-menu-page", decision: "approved", comment: null, decidedBy: "demo-user-2", decidedByName: "Maya Chen", createdAt: ago(11, 4) },
    { id: "ap-4", proposalId: "p-c-risotto-a-dinner-pdf", decision: "approved", comment: "Reprint scheduled for Friday.", decidedBy: "demo-user-2", decidedByName: "Maya Chen", createdAt: ago(11, 4) },
  ];

  const members: Member[] = [
    { userId: "demo-user-1", fullName: "Demo Visitor (you)", email: "visitor@demo.changemesh.invalid", role: "owner", joinedAt: ago(45) },
    { userId: "demo-user-2", fullName: "Maya Chen", email: "maya@harborvine.example", role: "admin", joinedAt: ago(44) },
    { userId: "demo-user-3", fullName: "Daniel Okafor", email: "daniel@harborvine.example", role: "editor", joinedAt: ago(30) },
    { userId: "demo-user-4", fullName: "Leyla Aliyeva", email: "leyla@harborvine.example", role: "viewer", joinedAt: ago(9) },
  ];

  let seq = 0;
  const ev = (hoursAgo: number, actor: Member | null, action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}): AuditEvent => ({
    id: `e-${++seq}`,
    actorId: actor?.userId ?? null,
    actorName: actor?.fullName ?? null,
    actorType: actor ? "user" : "system",
    action,
    targetType,
    targetId,
    metadata,
    createdAt: new Date(now.getTime() - hoursAgo * 3600_000).toISOString(),
  });
  const [, maya, daniel] = members;
  const audit: AuditEvent[] = [
    ev(3, null, "assets.update", "assets", "a-order", { changed: ["last_scan_error", "scan_status"], status: "failed", name: "Online ordering page" }),
    ev(6, null, "assets.update", "assets", "a-menu-page", { changed: ["last_scanned_at", "scan_status"], status: "succeeded", name: "Website — Menu page" }),
    ev(18, maya!, "update_proposals.update", "update_proposals", "p-c-burger-a-campaign", { changed: ["approval_status"], status: "needs_revision" }),
    ev(18, maya!, "approvals.insert", "approvals", "ap-2", { decision: "needs_revision" }),
    ev(20, maya!, "update_proposals.update", "update_proposals", "p-c-burger-a-menu-page", { changed: ["approval_status"], status: "approved" }),
    ev(20, maya!, "approvals.insert", "approvals", "ap-1", { decision: "approved" }),
    ev(26, daniel!, "changes.insert", "changes", "c-burger", { name: "Classic Burger price $12.00 → $15.00", status: "pending_approval" }),
    ev(27, daniel!, "assets.update", "assets", "a-price-csv", { changed: ["current_version"], name: "Master price list.csv" }),
    ev(72, daniel!, "changes.insert", "changes", "c-hours", { name: "Downtown opening hours extended to 23:00" }),
    ev(74, null, "assets.update", "assets", "a-pos-csv", { changed: ["last_scan_error", "scan_status"], status: "failed", name: "POS item export.csv" }),
    ev(120, null, "changes.insert", "changes", "c-phone", { name: "Harborside phone number differs between sources" }),
    ev(144, daniel!, "changes.insert", "changes", "c-truffle", { name: "Wholesale catalog still lists discontinued Truffle Fries" }),
    ev(170, daniel!, "asset_relationships.update", "asset_relationships", "r14", { changed: ["status"], status: "rejected" }),
    ev(216, maya!, "workspace_members.insert", "workspace_members", "demo-user-4", { role: "viewer", user_id: "demo-user-4" }),
    ev(268, maya!, "update_proposals.update", "update_proposals", "p-c-risotto-a-dinner-pdf", { changed: ["execution_status"], execution_status: "completed" }),
    ev(268, maya!, "update_proposals.update", "update_proposals", "p-c-risotto-a-menu-page", { changed: ["execution_status"], execution_status: "completed" }),
    ev(292, maya!, "approvals.insert", "approvals", "ap-3", { decision: "approved" }),
    ev(292, maya!, "approvals.insert", "approvals", "ap-4", { decision: "approved" }),
    ev(296, daniel!, "changes.insert", "changes", "c-risotto", { name: "Seasonal dish added: Pumpkin Risotto" }),
    ev(480, maya!, "changes.update", "changes", "c-kids", { changed: ["status"], status: "rejected", name: "Kids menu removed from Harborside" }),
    ev(720, daniel!, "assets.insert", "assets", "a-wholesale", { name: "Wholesale catalog 2026" }),
    ev(960, maya!, "assets.insert", "assets", "a-price-csv", { name: "Master price list.csv" }),
  ];

  return {
    assets,
    versions,
    relationships,
    changes,
    impacts,
    proposals,
    approvals,
    integrations: [],
    audit,
    auditVisible: true,
    members,
    subscription: { plan: "business", status: "trialing", currentPeriodEnd: new Date(now.getTime() + 10 * 86400_000).toISOString(), cancelAtPeriodEnd: false },
    factCounts: {},
  };
}
