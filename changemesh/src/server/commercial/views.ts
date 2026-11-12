import type { ApiScope } from "@/domain/commercial/inputs";
import type { WorkspaceRole } from "@/domain/rbac/roles";

export interface InvitationView {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: "open" | "expired";
  createdAt: string;
  expiresAt: string;
}

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export type NotificationKind = "approval_needed" | "revision_requested" | "scan_failed" | "invitation_accepted" | "payment_problem" | "update_failed";

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface OrganizationWorkspace {
  id: string;
  name: string;
  slug: string;
  isMember: boolean;
}

export interface OrganizationView {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member" | null;
  createdAt: string | null;
  workspaces: OrganizationWorkspace[];
}
