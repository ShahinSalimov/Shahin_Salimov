import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, Info, Link2Off, XCircle, AlertTriangle } from "lucide-react";
import { AssetIcon } from "@/components/app/asset-icon";
import { APPROVAL_META, ASSET_TYPE_META, CHANGE_TYPE_META, HEALTH_META, IMPACT_META, RELATIONSHIP_LABEL, RELATIONSHIP_STATUS_META, SCAN_STATUS_META } from "@/components/app/meta";
import { PageHeader, SectionCard } from "@/components/app/page-header";
import { PlannedTag, SampleTag, StatusPill } from "@/components/app/status-pill";
import { CreateChangeDialog } from "@/components/forms/create-change-dialog";
import { RelationshipReview } from "@/components/forms/relationship-review";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { assetHealth, isOpenChange } from "@/domain/insights/metrics";
import { can } from "@/domain/rbac/roles";
import { formatBytes, formatDateTime, percent, relativeTime } from "@/lib/format";
import { loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Asset" };

export default async function AssetDetailPage({ params }: { params: Promise<{ workspaceId: string; assetId: string }> }) {
  const { workspaceId, assetId } = await params;
  const ctx = await loadWorkspace(workspaceId);
  const snapshot = await loadSnapshot(ctx);
  const asset = snapshot.assets.find((a) => a.id === assetId);
  if (!asset) notFound();
  const base = `/w/${ctx.workspace.id}`;
  const now = new Date();
  const names = new Map(snapshot.assets.map((a) => [a.id, a.name]));
  const health = assetHealth(asset, snapshot);
  const rels = snapshot.relationships.filter((r) => r.sourceAssetId === asset.id || r.targetAssetId === asset.id);
  const openChangeIds = new Set(snapshot.changes.filter(isOpenChange).map((c) => c.id));
  const impacts = snapshot.impacts.filter((i) => i.assetId === asset.id).sort((a, b) => Number(openChangeIds.has(b.changeId)) - Number(openChangeIds.has(a.changeId)));
  const proposals = snapshot.proposals.filter((p) => p.targetAssetId === asset.id);
  const versions = snapshot.versions.filter((v) => v.assetId === asset.id).sort((a, b) => b.version - a.version);
  const canEdit = can(ctx.role, "relationships.write");
  const safeUrl = asset.sourceUrl && /^https?:\/\//i.test(asset.sourceUrl) ? asset.sourceUrl : null;

  return (
    <div className="grid gap-6">
      <Link href={`${base}/assets`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Assets
      </Link>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            {ASSET_TYPE_META[asset.type].label} {asset.origin === "demo" ? <SampleTag /> : null}
          </span>
        }
        title={
          <span className="flex items-center gap-3">
            <AssetIcon type={asset.type} className="size-10" />
            <span className="min-w-0 break-words">{asset.name}</span>
          </span>
        }
        actions={
          <>
            {safeUrl ? (
              <Button asChild variant="outline">
                <a href={safeUrl} target="_blank" rel="noopener noreferrer nofollow">
                  <ExternalLink />
                  Open source
                </a>
              </Button>
            ) : null}
            {can(ctx.role, "changes.write") ? <CreateChangeDialog workspaceId={ctx.workspace.id} assets={snapshot.assets.map((a) => ({ id: a.id, name: a.name }))} defaultAssetId={asset.id} variant="outline" /> : null}
          </>
        }
      />

      {asset.scanStatus === "failed" || asset.scanStatus === "partial" ? (
        <Alert variant={asset.scanStatus === "failed" ? "destructive" : "warning"}>
          {asset.scanStatus === "failed" ? <XCircle /> : <AlertTriangle />}
          <AlertTitle>{asset.scanStatus === "failed" ? "The last scan failed" : "The last scan was incomplete"}</AlertTitle>
          <AlertDescription>{asset.lastScanError ?? "No error details were recorded."}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="grid gap-6 lg:col-span-2">
          <SectionCard title="Affected by changes" description="Open changes first">
            {impacts.length ? (
              <ul className="divide-y">
                {impacts.map((i) => {
                  const change = snapshot.changes.find((c) => c.id === i.changeId);
                  const open = openChangeIds.has(i.changeId);
                  return (
                    <li key={i.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <Link href={`${base}/changes/${i.changeId}`} className="text-sm font-medium hover:underline">
                          {change?.title ?? "Change"}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {i.oldValue ?? "—"} → <span className="font-medium text-foreground">{i.newValue ?? "—"}</span> · confidence {percent(i.confidence)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {change ? <StatusPill meta={CHANGE_TYPE_META[change.type]} size="xs" /> : null}
                        <StatusPill meta={IMPACT_META[i.level]} size="xs" />
                        {!open ? <span className="text-xs text-muted-foreground">Closed</span> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No recorded change affects this asset.</p>
            )}
          </SectionCard>

          <SectionCard title="Connections" description={`${rels.length} relationship${rels.length === 1 ? "" : "s"}`} action={<Link href={`${base}/graph`} className="text-xs font-medium text-primary hover:underline">Change Map</Link>}>
            {rels.length ? (
              <ul className="divide-y">
                {rels.map((r) => {
                  const outgoing = r.sourceAssetId === asset.id;
                  const otherId = outgoing ? r.targetAssetId : r.sourceAssetId;
                  const sentence = outgoing ? `This asset ${RELATIONSHIP_LABEL[r.type]} ${names.get(otherId)}` : `${names.get(otherId)} ${RELATIONSHIP_LABEL[r.type]} this asset`;
                  return (
                    <li key={r.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm">
                          {outgoing ? <span className="text-muted-foreground">This asset</span> : <Link className="font-medium hover:underline" href={`${base}/assets/${otherId}`}>{names.get(otherId)}</Link>}
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground italic">{RELATIONSHIP_LABEL[r.type]}</span>
                          <ArrowRight className="size-3 text-muted-foreground" aria-hidden="true" />
                          {outgoing ? <Link className="font-medium hover:underline" href={`${base}/assets/${otherId}`}>{names.get(otherId)}</Link> : <span className="text-muted-foreground">this asset</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Confidence {percent(r.confidence)}
                          {r.note ? ` · ${r.note}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill meta={RELATIONSHIP_STATUS_META[r.status]} size="xs" />
                        {r.status === "suggested" && canEdit ? <RelationshipReview workspaceId={ctx.workspace.id} relationshipId={r.id} label={sentence} /> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Link2Off className="size-4" /> Not connected to any other asset yet. A change elsewhere cannot be traced to it.
              </div>
            )}
          </SectionCard>

          <SectionCard title="Update proposals">
            {proposals.length ? (
              <ul className="divide-y">
                {proposals.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1 text-sm">
                      <span className="text-muted-foreground line-through decoration-muted-foreground/50">{p.currentValue ?? "—"}</span> → <span className="font-medium">{p.proposedValue ?? "—"}</span>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.reason}</p>
                    </div>
                    <StatusPill meta={APPROVAL_META[p.approvalStatus]} size="xs" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No update proposals for this asset.</p>
            )}
          </SectionCard>
        </div>

        <div className="grid gap-6">
          <SectionCard title="Details">
            <dl className="grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Health</dt>
                <dd>
                  <StatusPill meta={HEALTH_META[health]} size="xs" />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Scan</dt>
                <dd>
                  <StatusPill meta={SCAN_STATUS_META[asset.scanStatus]} size="xs" />
                </dd>
              </div>
              <Row label="Last scanned" value={asset.lastScannedAt ? relativeTime(asset.lastScannedAt, now) : "Never"} title={formatDateTime(asset.lastScannedAt)} />
              <Row label="Version" value={asset.currentVersion ? `v${asset.currentVersion}` : "No content yet"} />
              {asset.sizeBytes ? <Row label="Size" value={formatBytes(asset.sizeBytes)} /> : null}
              <Row label="Customer-facing" value={asset.isCustomerFacing ? "Yes" : "No (internal)"} />
              <Row label="Registered" value={formatDateTime(asset.createdAt)} />
              {asset.sourceUrl ? (
                <div className="grid gap-1">
                  <dt className="text-muted-foreground">URL</dt>
                  <dd className="font-mono text-xs break-all">{asset.sourceUrl}</dd>
                </div>
              ) : null}
              {asset.description ? (
                <div className="grid gap-1">
                  <dt className="text-muted-foreground">Description</dt>
                  <dd>{asset.description}</dd>
                </div>
              ) : null}
            </dl>
          </SectionCard>
          <SectionCard title="Scanning" action={<PlannedTag stage="Stage 3" />}>
            <p className="flex gap-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              Uploading files and scanning websites are part of the Asset Intelligence stage. Until then scan results are shown as recorded, and nothing is fetched.
            </p>
          </SectionCard>
          <SectionCard title="Version history">
            {versions.length ? (
              <ol className="grid gap-3">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-start gap-3 text-sm">
                    <span className="tabular rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">v{v.version}</span>
                    <div className="min-w-0">
                      <p className="truncate">{typeof v.summary.note === "string" ? v.summary.note : "Content captured"}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No versions captured yet.</p>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right" title={title}>
        {value}
      </dd>
    </div>
  );
}
