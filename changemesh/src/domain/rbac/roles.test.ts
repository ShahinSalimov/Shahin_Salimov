import { describe, expect, it } from "vitest";
import { can, canAssignRole, hasOrganizationRole, hasWorkspaceRole, isWorkspaceRole, PERMISSIONS, WORKSPACE_ROLES } from "./roles";

describe("workspace roles", () => {
  it("orders roles owner > admin > editor > viewer", () => {
    expect(hasWorkspaceRole("owner", "admin")).toBe(true);
    expect(hasWorkspaceRole("admin", "editor")).toBe(true);
    expect(hasWorkspaceRole("editor", "viewer")).toBe(true);
    expect(hasWorkspaceRole("viewer", "editor")).toBe(false);
    expect(hasWorkspaceRole("editor", "admin")).toBe(false);
    expect(hasWorkspaceRole("admin", "owner")).toBe(false);
  });

  it("denies everything to non-members", () => {
    for (const permission of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(can(null, permission)).toBe(false);
      expect(can(undefined, permission)).toBe(false);
    }
  });

  it("lets viewers read but not write", () => {
    expect(can("viewer", "assets.view")).toBe(true);
    expect(can("viewer", "assets.write")).toBe(false);
    expect(can("viewer", "changes.write")).toBe(false);
    expect(can("viewer", "proposals.decide")).toBe(false);
  });

  it("lets editors write content but not decide or manage", () => {
    expect(can("editor", "assets.write")).toBe(true);
    expect(can("editor", "changes.write")).toBe(true);
    expect(can("editor", "proposals.decide")).toBe(false);
    expect(can("editor", "members.manage")).toBe(false);
    expect(can("editor", "integrations.manage")).toBe(false);
  });

  it("reserves workspace deletion for owners", () => {
    expect(can("admin", "workspace.delete")).toBe(false);
    expect(can("owner", "workspace.delete")).toBe(true);
  });

  it("validates role strings", () => {
    for (const r of WORKSPACE_ROLES) expect(isWorkspaceRole(r)).toBe(true);
    expect(isWorkspaceRole("superuser")).toBe(false);
    expect(isWorkspaceRole(undefined)).toBe(false);
  });
});

describe("role assignment", () => {
  it("only owners can grant or touch the owner role", () => {
    expect(canAssignRole("owner", "owner")).toBe(true);
    expect(canAssignRole("admin", "owner")).toBe(false);
    expect(canAssignRole("admin", "editor")).toBe(true);
    expect(canAssignRole("editor", "viewer")).toBe(false);
    expect(canAssignRole("viewer", "viewer")).toBe(false);
  });
});

describe("organization roles", () => {
  it("orders owner > admin > member", () => {
    expect(hasOrganizationRole("owner", "admin")).toBe(true);
    expect(hasOrganizationRole("member", "admin")).toBe(false);
    expect(hasOrganizationRole(null, "member")).toBe(false);
  });
});
