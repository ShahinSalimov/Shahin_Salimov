import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMessages } from "@/i18n/server";
import { listMembers } from "@/server/workspaces/service";
import { loadWorkspace } from "@/server/workspaces/load";

export default async function WorkspaceOverviewPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await loadWorkspace(workspaceId);
  const [t, members] = await Promise.all([getMessages(), listMembers(ctx)]);

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm text-muted-foreground">{ctx.workspace.organizationName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{ctx.workspace.name}</h1>
      </div>
      <Alert>
        <Info />
        <AlertDescription>{t.workspace.foundationNotice}</AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>
            {t.workspace.members} <span className="text-muted-foreground">({members.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.fullName ?? m.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                <Badge variant="outline">{t.roles[m.role]}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
