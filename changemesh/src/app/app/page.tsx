import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth/session";
import { listWorkspaces } from "@/server/workspaces/service";

/** Entry point after sign-in: open the first workspace or start onboarding. */
export default async function AppEntryPage() {
  const viewer = await requireViewer("/app");
  const workspaces = await listWorkspaces(viewer);
  const first = workspaces[0];
  redirect(first ? `/w/${first.id}` : "/onboarding");
}
