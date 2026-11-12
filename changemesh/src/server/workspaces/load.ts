import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AppError } from "@/lib/errors";
import { requireViewer } from "../auth/session";
import { getWorkspaceContext, type WorkspaceContext } from "./service";

/** Page helper: resolves the workspace for the current viewer or renders 404. */
export const loadWorkspace = cache(async (workspaceId: string): Promise<WorkspaceContext> => {
  const viewer = await requireViewer(`/w/${workspaceId}`);
  try {
    return await getWorkspaceContext(viewer, workspaceId);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
});
