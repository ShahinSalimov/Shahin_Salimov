import { effectivePlan } from "@/domain/billing/usage";
import { authenticate, handle } from "@/server/api/v1";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle("v1.workspace", async () => {
    const caller = await authenticate(request, "read");
    if (caller instanceof Response) return caller;
    const [ws, sub] = await Promise.all([
      caller.db.from("workspaces").select("id, name, slug, created_at").eq("id", caller.workspaceId).single(),
      caller.db.from("subscriptions").select("plan, status").eq("organization_id", caller.organizationId).maybeSingle<{ plan: "starter" | "business" | "agency" | "enterprise"; status: string }>(),
    ]);
    if (ws.error) throw ws.error;
    return Response.json({ data: { ...ws.data, plan: effectivePlan(sub.data ?? null), scopes: caller.scopes } });
  });
}
