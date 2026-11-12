export interface IntegrationProvider {
  id: string;
  name: string;
  category: "Spreadsheets" | "Website" | "Commerce" | "Listings" | "Developer";
  description: string;
  capabilities: ("read" | "write")[];
}

/** Connectors on the roadmap. None is implemented yet; the UI must never show them as connected. */
export const INTEGRATION_CATALOG: IntegrationProvider[] = [
  { id: "google_sheets", name: "Google Sheets", category: "Spreadsheets", description: "Read price lists and product data directly from a spreadsheet.", capabilities: ["read"] },
  { id: "wordpress", name: "WordPress", category: "Website", description: "Scan pages and, after approval, update content through the REST API.", capabilities: ["read", "write"] },
  { id: "shopify", name: "Shopify", category: "Commerce", description: "Compare product prices and availability with your catalog.", capabilities: ["read", "write"] },
  { id: "webflow", name: "Webflow", category: "Website", description: "Read CMS collections and propose approved updates.", capabilities: ["read", "write"] },
  { id: "google_business_profile", name: "Google Business Profile", category: "Listings", description: "Keep opening hours, phone numbers and descriptions consistent.", capabilities: ["read", "write"] },
  { id: "webhooks", name: "Webhooks", category: "Developer", description: "Send approved update instructions to your own systems.", capabilities: ["write"] },
];
