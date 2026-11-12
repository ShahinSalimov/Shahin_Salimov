"use server";

import { redirect } from "next/navigation";
import { createOrganizationSchema } from "@/domain/workspace/schemas";
import { slugify } from "@/domain/workspace/slug";
import { AppError, fromPostgresError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { formToObject, runAction } from "../action";
import { getViewer } from "../auth/session";
import { createUserClient } from "../supabase/clients";

export type OnboardingState = ActionResult<{ workspaceId: string }> | null;

const MAX_SLUG_ATTEMPTS = 4;

export async function createOrganizationAction(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const result = await runAction("workspace.create_organization", async () => {
    const viewer = await getViewer();
    if (!viewer || viewer.kind !== "user") throw new AppError("UNAUTHENTICATED", "Create an account to set up your own workspace.");
    const input = createOrganizationSchema.parse(formToObject(form));
    const supabase = await createUserClient();
    const base = slugify(input.organizationName);

    // Organization slugs are globally unique; retry with a short suffix on collision.
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const orgSlug = attempt === 0 ? base : `${base.slice(0, 40)}-${crypto.randomUUID().slice(0, 6)}`;
      const { data, error } = await supabase
        .rpc("create_organization_with_workspace", {
          org_name: input.organizationName,
          org_slug: orgSlug,
          workspace_name: input.workspaceName,
          workspace_slug: slugify(input.workspaceName),
        })
        .single<{ organization_id: string; workspace_id: string }>();
      if (!error && data) {
        logger.info("workspace.created", { userId: viewer.id, organizationId: data.organization_id, workspaceId: data.workspace_id });
        return { workspaceId: data.workspace_id };
      }
      if (error?.code === "23505") continue;
      throw fromPostgresError(error) ?? new AppError("INTERNAL", "Could not create the workspace.", { cause: error });
    }
    throw new AppError("CONFLICT", "Please choose a different organization name.");
  });
  if (result.ok) redirect(`/w/${result.data.workspaceId}`);
  return result;
}
