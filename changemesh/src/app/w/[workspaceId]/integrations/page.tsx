import type { Metadata } from "next";
import { Info, Plug } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PlannedTag, StatusPill } from "@/components/app/status-pill";
import type { StatusMeta } from "@/components/app/meta";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { INTEGRATION_CATALOG } from "@/domain/integrations/catalog";
import type { IntegrationStatus } from "@/domain/workspace/model";
import { relativeTime } from "@/lib/format";
import { CheckCircle2, CircleDashed, XCircle, PauseCircle } from "lucide-react";
import { loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Integrations" };

const STATUS: Record<IntegrationStatus, StatusMeta> = {
  not_connected: { label: "Not connected", tone: "neutral", icon: CircleDashed },
  connected: { label: "Connected", tone: "success", icon: CheckCircle2 },
  error: { label: "Error", tone: "danger", icon: XCircle },
  disabled: { label: "Disabled", tone: "neutral", icon: PauseCircle },
};

export default async function IntegrationsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await loadWorkspace(workspaceId);
  const snapshot = await loadSnapshot(ctx);
  const now = new Date();

  return (
    <div className="grid gap-6">
      <PageHeader title="Integrations" description="Connect the systems where your information lives. Every write to an external system requires approval." />
      <Alert>
        <Info />
        <AlertTitle>No connectors are available yet</AlertTitle>
        <AlertDescription>
          Integrations are on the roadmap. Until then, register assets manually and apply approved updates yourself. CHANGEMESH never shows a connection that has not been verified.
        </AlertDescription>
      </Alert>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {INTEGRATION_CATALOG.map((provider) => {
          const row = snapshot.integrations.find((i) => i.provider === provider.id);
          const status: IntegrationStatus = row?.status ?? "not_connected";
          return (
            <li key={provider.id} className="flex flex-col rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-lg border bg-background text-sm font-semibold" aria-hidden="true">
                  {provider.name.slice(0, 2)}
                </span>
                <StatusPill meta={STATUS[status]} size="xs" />
              </div>
              <h2 className="mt-4 font-medium">{provider.name}</h2>
              <p className="text-xs text-muted-foreground">{provider.category}</p>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{provider.description}</p>
              <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
                <span className="text-xs text-muted-foreground">{provider.capabilities.map((c) => (c === "read" ? "Read" : "Write after approval")).join(" · ")}</span>
                {row?.lastSyncedAt ? <span className="text-xs text-muted-foreground">Synced {relativeTime(row.lastSyncedAt, now)}</span> : <PlannedTag stage="Roadmap" />}
              </div>
              {row?.lastError ? <p className="mt-2 text-xs text-destructive">{row.lastError}</p> : null}
            </li>
          );
        })}
      </ul>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Plug className="size-3.5" /> Need a specific connector? It will be prioritized by customer demand.
      </p>
    </div>
  );
}
