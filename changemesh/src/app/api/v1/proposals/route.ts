import { APPROVAL_STATUSES } from "@/domain/workspace/model";
import { apiError, authenticate, handle, pagination } from "@/server/api/v1";

export const dynamic = "force-dynamic";

const COLUMNS = "id, change_id, target_asset_id, current_value, proposed_value, reason, impact_level, approval_status, execution_status, created_at, updated_at";

/** Read-only. Proposals are approved by people in the app, never through the API. */
export async function GET(request: Request) {
  return handle("v1.proposals.list", async () => {
    const caller = await authenticate(request, "read");
    if (caller instanceof Response) return caller;
    const url = new URL(request.url);
    const { limit, offset } = pagination(url);
    let q = caller.db.from("update_proposals").select(COLUMNS, { count: "exact" }).eq("workspace_id", caller.workspaceId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    const status = url.searchParams.get("approval_status");
    if (status) {
      if (!(APPROVAL_STATUSES as readonly string[]).includes(status)) return apiError(422, "VALIDATION_FAILED", `approval_status must be one of ${APPROVAL_STATUSES.join(", ")}.`);
      q = q.eq("approval_status", status);
    }
    const { data, error, count } = await q;
    if (error) throw error;
    return Response.json({ data, pagination: { limit, offset, total: count ?? null } });
  });
}
