import { z } from "zod";
import { WORKSPACE_ROLES } from "../rbac/roles";
import { SLUG_PATTERN } from "./slug";

const name = z
  .string()
  .trim()
  .min(2, "Must be at least 2 characters.")
  .max(80, "Must be at most 80 characters.");

export const createOrganizationSchema = z.object({
  organizationName: name,
  workspaceName: name,
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const createWorkspaceSchema = z.object({
  organizationId: z.string().uuid(),
  name,
  slug: z.string().regex(SLUG_PATTERN, "Use lowercase letters, numbers and hyphens."),
});

export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);
