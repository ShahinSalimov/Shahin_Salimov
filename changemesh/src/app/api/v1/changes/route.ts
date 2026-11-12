import { createChangeSchema } from "@/domain/workspace/inputs";
import { CHANGE_STATUSES } from "@/domain/workspace/model";
import { apiError, authenticate, handle, pagination } from "@/server/api/v1";

export const dynamic = "force-dynamic";

const COLUMNS = "id, title, description, change_type, status, entity_name, attribute_name, old_value, new_value, source_asset_id, origin, analyzed_at, created_at, updated_at";

export async function GET(request: Request) {
  return handle("v1.changes.list", async () => {
    const caller = await authenticate(request, "read");
    if (caller instanceof Response) return caller;
    const url = new URL(request.url);
    const { limit, offset } = pagination(url);
    let q = caller.db.from("changes").select(COLUMNS, { count: "exact" }).eq("workspace_id", caller.workspaceId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    const status = url.searchParams.get("status");
    if (status) {
      if (!(CHANGE_STATUSES as readonly string[]).includes(status)) return apiError(422, "VALIDATION_FAILED", `status must be one of ${CHANGE_STATUSES.join(", ")}.`);
      q = q.eq("status", status);
    }
    const { data, error, count } = await q;
    if (error) throw error;
    return Response.json({ data, pagination: { limit, offset, total: count ?? null } });
  });
}

/**
 * Registers a change as a draft (origin "api"). Impact analysis and approval
 * still happen in the app; the API cannot approve or execute anything.
 */
export async function POST(request: Request) {
  return handle("v1.changes.create", async () => {
    const caller = await authenticate(request, "write");
    if (caller instanceof Response) return caller;
    if (Number(request.headers.get("content-length") ?? 0) > 64_000) return apiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
    const body = (await request.json()) as Record<string, unknown>;
    const input = createChangeSchema.parse(Object.fromEntries(Object.entries(body ?? {}).map(([k, v]) => [k, typeof v === "string" ? v : v == null ? undefined : String(v)])));
    if (input.sourceAssetId) {
      const asset = await caller.db.from("assets").select("id").eq("id", input.sourceAssetId).eq("workspace_id", caller.workspaceId).maybeSingle();
      if (!asset.data) return apiError(422, "VALIDATION_FAILED", "sourceAssetId does not belong to this workspace.");
    }
    const { data, error } = await caller.db
      .from("changes")
      .insert({
        workspace_id: caller.workspaceId,
        title: input.title,
        change_type: input.type,
        description: input.description,
        entity_name: input.entityName,
        attribute_name: input.attributeName,
        old_value: input.oldValue,
        new_value: input.newValue,
        source_asset_id: input.sourceAssetId,
        origin: "api",
        status: "draft",
      })
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return Response.json({ data }, { status: 201 });
  });
}
