import type { WorkspaceRole } from "@/domain/rbac/roles";

/**
 * Demo mode data. Entirely fictional, clearly labeled in the UI, and never
 * mixed with real tenant data. Demo sessions cannot reach Supabase.
 */
export const DEMO_WORKSPACE_ID = "demo";

export const demoOrganization = {
  id: "demo-org",
  name: "Harbor & Vine Hospitality",
  slug: "harbor-vine",
  isDemo: true,
} as const;

export const demoWorkspace = {
  id: DEMO_WORKSPACE_ID,
  organizationId: demoOrganization.id,
  name: "Harbor & Vine — Restaurants",
  slug: "restaurants",
  isDemo: true,
  createdAt: "2026-10-01T09:00:00.000Z",
} as const;

export const demoViewerRole: WorkspaceRole = "owner";
