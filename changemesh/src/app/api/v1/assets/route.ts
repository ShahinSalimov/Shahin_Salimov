import { ASSET_TYPES } from "@/domain/workspace/model";
import { apiError, authenticate, handle, pagination } from "@/server/api/v1";

export const dynamic = "force-dynamic";

const COLUMNS = "id, type, name, description, source_url, status, scan_status, last_scanned_at, current_version, created_at, updated_at";

export async function GET(request: Request) {
  return handle("v1.assets.list", async () => {
    const caller = await authenticate(request, "read");
    if (caller instanceof Response) return caller;
    const url = new URL(request.url);
    const { limit, offset } = pagination(url);
    let q = caller.db.from("assets").select(COLUMNS, { count: "exact" }).eq("workspace_id", caller.workspaceId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    const type = url.searchParams.get("type");
    if (type) {
      if (!(ASSET_TYPES as readonly string[]).includes(type)) return apiError(422, "VALIDATION_FAILED", `type must be one of ${ASSET_TYPES.join(", ")}.`);
      q = q.eq("type", type);
    }
    const { data, error, count } = await q;
    if (error) throw error;
    return Response.json({ data, pagination: { limit, offset, total: count ?? null } });
  });
}
