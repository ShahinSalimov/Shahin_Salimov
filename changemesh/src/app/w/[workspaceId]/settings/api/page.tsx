import type { Metadata } from "next";
import { PageHeader, SectionCard } from "@/components/app/page-header";
import { SettingsNav } from "@/components/app/settings-nav";
import { CreateApiKeyDialog, RevokeApiKeyButton } from "@/components/forms/commercial-forms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/domain/rbac/roles";
import { formatDate } from "@/lib/format";
import { listApiKeys } from "@/server/commercial/service";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiKeysPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await loadWorkspace(workspaceId);
  const base = `/w/${ctx.workspace.id}`;
  const manage = can(ctx.role, "api_keys.manage");
  const keys = manage ? await listApiKeys(ctx) : [];
  const isDemo = ctx.viewer.kind === "demo";

  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description={ctx.workspace.name} />
      <SettingsNav base={base} active="api" />
      {!manage ? (
        <Alert>
          <AlertDescription>Only workspace admins and owners can view and manage API keys.</AlertDescription>
        </Alert>
      ) : (
        <SectionCard
          title="API keys"
          description="Keys give programs access to this workspace through the REST API (/api/v1). Only a hash of each key is stored."
          action={<CreateApiKeyDialog workspaceId={ctx.workspace.id} disabledReason={isDemo ? "API keys need a real account." : undefined} />}
          bodyClassName="px-0 pb-0"
        >
          {keys.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">{isDemo ? "API keys are not available in the demo." : "No API keys yet."}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead className="hidden md:table-cell">Last used</TableHead>
                  <TableHead className="hidden md:table-cell">Expires</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => {
                  const expired = k.expired;
                  const inactive = k.revokedAt !== null || expired;
                  return (
                    <TableRow key={k.id} className={inactive ? "opacity-60" : undefined}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell>
                        <code className="text-xs">{k.prefix}_…</code>
                      </TableCell>
                      <TableCell>
                        {k.revokedAt ? <Badge variant="outline">Revoked</Badge> : expired ? <Badge variant="secondary">Expired</Badge> : <Badge variant="secondary">{k.scopes.includes("write") ? "Read & write" : "Read only"}</Badge>}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{k.lastUsedAt ? formatDate(k.lastUsedAt) : "Never"}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{k.expiresAt ? formatDate(k.expiresAt) : "Never"}</TableCell>
                      <TableCell>{inactive ? null : <RevokeApiKeyButton workspaceId={ctx.workspace.id} keyId={k.id} name={k.name} />}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      )}
      <SectionCard title="Using the API" description="Full reference: API_DOCUMENTATION.md in the repository.">
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{`curl -H "Authorization: Bearer cm_xxxxxxxx_…" \\
  ${"$"}APP_URL/api/v1/changes?status=pending_approval`}</pre>
        <ul className="mt-3 grid gap-1 text-sm text-muted-foreground">
          <li>GET /api/v1/workspace, /assets, /changes, /proposals — read scope</li>
          <li>POST /api/v1/changes — write scope; creates a draft change. Approval always happens in the app.</li>
          <li>120 requests per minute per key.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
