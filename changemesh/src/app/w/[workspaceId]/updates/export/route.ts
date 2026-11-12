import { NextResponse, type NextRequest } from "next/server";
import { instructionRows, toCsv, toMarkdown } from "@/domain/updates/export";
import { AppError } from "@/lib/errors";
import { getViewer } from "@/server/auth/session";
import { getWorkspaceData } from "@/server/data";
import { getWorkspaceContext } from "@/server/workspaces/service";

/** Downloads update instructions (CSV or Markdown). Members can export; nothing is changed. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const ctx = await getWorkspaceContext(viewer, workspaceId, "changes.view");
    const snapshot = await getWorkspaceData(ctx).snapshot();
    const scope = request.nextUrl.searchParams.get("scope") === "all" ? "all" : "open";
    const format = request.nextUrl.searchParams.get("format") === "md" ? "md" : "csv";
    const proposals = snapshot.proposals.filter((p) => (scope === "all" ? true : p.approvalStatus === "approved" && p.executionStatus !== "completed"));
    const rows = instructionRows(proposals, snapshot.assets, snapshot.changes);
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `changemesh-updates-${scope}-${stamp}.${format}`;
    const body = format === "md" ? toMarkdown(rows, `Update instructions — ${ctx.workspace.name}`, new Date().toISOString()) : toCsv(rows);
    return new NextResponse(body, {
      headers: {
        "content-type": format === "md" ? "text/markdown; charset=utf-8" : "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
