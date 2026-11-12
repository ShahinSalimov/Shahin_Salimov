import "server-only";
import { cache } from "react";
import type { WorkspaceSnapshot } from "@/domain/workspace/model";
import type { WorkspaceContext } from "../workspaces/service";
import { DemoWorkspaceData } from "./demo";
import type { WorkspaceData } from "./source";
import { SupabaseWorkspaceData } from "./supabase";

export function getWorkspaceData(ctx: WorkspaceContext): WorkspaceData {
  if (ctx.viewer.kind === "demo") return new DemoWorkspaceData(ctx.viewer.sessionId);
  return new SupabaseWorkspaceData(ctx.workspace.id, ctx.workspace.organizationId);
}

/** One snapshot per request, shared by layout and page. */
export const loadSnapshot = cache(async (ctx: WorkspaceContext): Promise<WorkspaceSnapshot> => getWorkspaceData(ctx).snapshot());
