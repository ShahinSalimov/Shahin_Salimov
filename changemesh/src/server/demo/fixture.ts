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

export const demoMembers: { userId: string; fullName: string; email: string; role: WorkspaceRole }[] = [
  { userId: "demo-user-1", fullName: "Demo Visitor (you)", email: "visitor@demo.changemesh.invalid", role: "owner" },
  { userId: "demo-user-2", fullName: "Maya Chen", email: "maya@harborvine.example", role: "admin" },
  { userId: "demo-user-3", fullName: "Daniel Okafor", email: "daniel@harborvine.example", role: "editor" },
  { userId: "demo-user-4", fullName: "Leyla Aliyeva", email: "leyla@harborvine.example", role: "viewer" },
];
