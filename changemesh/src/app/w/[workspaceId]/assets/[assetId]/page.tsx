import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, ExternalLink, FlaskConical, Link2Off, ScanSearch, SearchX, XCircle } from "lucide-react";
import { AssetIcon } from "@/components/app/asset-icon";
import { APPROVAL_META, ASSET_TYPE_META, CHANGE_TYPE_META, HEALTH_META, IMPACT_META, RELATIONSHIP_LABEL, RELATIONSHIP_STATUS_META, SCAN_STATUS_META } from "@/components/app/meta";
import { PageHeader, SectionCard } from "@/components/app/page-header";
import { SampleTag, StatusPill } from "@/components/app/status-pill";
import { FilterChips, SearchForm, str } from "@/components/app/filters";
import { formatLocation, METHOD_LABEL } from "@/components/app/fact-meta";
import { EmptyState } from "@/components/app/empty-state";
import { ContentSummary } from "@/components/features/content-summary";
import { ScanHistory } from "@/components/features/scan-history";
import { AddFactDialog, DeleteAssetDialog, DeleteFactButton, EditAssetDialog, ScanButton, UploadForm } from "@/components/forms/asset-forms";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Asset } from "@/domain/workspace/model";
import { CreateChangeDialog } from "@/components/forms/create-change-dialog";
import { RelationshipReview } from "@/components/forms/relationship-review";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { assetHealth, isOpenChange } from "@/domain/insights/metrics";
import { can } from "@/domain/rbac/roles";
import { formatBytes, formatDateTime, percent, relativeTime } from "@/lib/format";
import { getWorkspaceData, loadSnapshot } from "@/server/data";
import { cn } from "@/lib/utils";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Asset" };
// Scans (10 s fetch) and PDF reading (20 s) run in Server Actions on this route.
export const maxDuration = 60;

export default async function AssetDetailPage({ params, searchParams }: { params: Promise<{ workspaceId: string; assetId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspaceId, assetId } = await params;
  const sp = await searchParams;
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
  const intel = await getWorkspaceData(ctx).assetIntelligence(asset.id);
  const canWrite = can(ctx.role, "assets.write");
  const isDemo = ctx.viewer.kind === "demo";
  const tab = (["overview", "information", "scans"] as const).find((t) => t === str(sp.tab)) ?? "overview";
  const path = `${base}/assets/${asset.id}`;
  const latestVersion = versions[0];
  const q = str(sp.q)?.toLowerCase();
  const facts = intel.facts
    .filter((f) => !q || `${f.entityName} ${f.attributeName} ${f.valueText}`.toLowerCase().includes(q))
    .sort((a, b) => a.entityName.localeCompare(b.entityName) || a.attributeName.localeCompare(b.attributeName));

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
            {canWrite ? (
              <EditAssetDialog
                workspaceId={ctx.workspace.id}
                assetId={asset.id}
                name={asset.name}
                description={asset.description}
                sourceUrl={asset.sourceUrl}
                isCustomerFacing={asset.isCustomerFacing}
                urlRequired={asset.type === "website"}
              />
            ) : null}
            {can(ctx.role, "assets.delete") ? <DeleteAssetDialog workspaceId={ctx.workspace.id} assetId={asset.id} name={asset.name} factsCount={intel.facts.length} versions={versions.length} /> : null}
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

      <FilterChips
        label="Asset sections"
        active={tab}
        options={[
          { value: "overview", label: "Overview", href: path },
          { value: "information", label: "Extracted information", count: intel.facts.length, href: `${path}?tab=information` },
          { value: "scans", label: "Scans & versions", count: intel.scans.length, href: `${path}?tab=scans` },
        ]}
      />

      {tab === "information" ? (
        <SectionCard
          title="Extracted information"
          description={`${intel.facts.length} current fact${intel.facts.length === 1 ? "" : "s"}${asset.currentVersion ? ` from version v${asset.currentVersion}` : ""} plus manual entries. Extracted by rules, not AI.`}
          action={canWrite ? <AddFactDialog workspaceId={ctx.workspace.id} assetId={asset.id} defaultEntity={asset.name} /> : null}
          bodyClassName="px-0 pb-0"
        >
          {intel.facts.length ? (
            <>
              <div className="px-5 pb-3">
                <SearchForm action={path} defaultValue={str(sp.q)} placeholder="Search entity, attribute or value" keep={{ tab: "information" }} />
              </div>
              {facts.length ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Entity</TableHead>
                      <TableHead>Attribute</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead className="hidden lg:table-cell">Source location</TableHead>
                      <TableHead className="hidden sm:table-cell">Confidence</TableHead>
                      <TableHead className="w-10">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {facts.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="max-w-[14rem] font-medium">
                          <span className="block truncate" title={f.entityName}>
                            {f.entityName}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{f.attributeName}</TableCell>
                        <TableCell className="max-w-[16rem]">
                          <span className="block truncate" title={f.valueText}>
                            {f.valueText}
                          </span>
                          {f.normalizedValue !== f.valueText.toLowerCase() ? <span className="block truncate font-mono text-[11px] text-muted-foreground">{f.normalizedValue}</span> : null}
                        </TableCell>
                        <TableCell className="hidden max-w-[16rem] lg:table-cell">
                          <span className="block truncate text-xs text-muted-foreground" title={f.location.snippet ?? formatLocation(f.location)}>
                            <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">{METHOD_LABEL[f.method]}</span>
                            {formatLocation(f.location)}
                          </span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="flex items-center gap-2 text-xs">
                            <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                              <span className={cn("block h-full rounded-full", f.confidence >= 0.85 ? "bg-success" : f.confidence >= 0.65 ? "bg-warning" : "bg-destructive")} style={{ width: percent(f.confidence) }} />
                            </span>
                            <span className="tabular">{percent(f.confidence)}</span>
                          </span>
                        </TableCell>
                        <TableCell>{f.method === "manual" && canWrite ? <DeleteFactButton workspaceId={ctx.workspace.id} factId={f.id} label={`${f.entityName} ${f.attributeName}`} /> : null}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="border-t px-5 py-8 text-center text-sm text-muted-foreground">No facts match “{str(sp.q)}”.</p>
              )}
            </>
          ) : (
            <div className="px-5 pb-5">
              <EmptyState
                icon={asset.scanStatus === "not_scanned" ? ScanSearch : SearchX}
                title={asset.scanStatus === "not_scanned" ? "Nothing extracted yet" : "No facts were recognized"}
                description={
                  asset.type === "manual"
                    ? "Manual records hold facts that people enter. Add the first one."
                    : asset.scanStatus === "not_scanned"
                      ? "Upload a file or scan the page from the Overview tab."
                      : "The content was read, but no prices, contact details, opening hours or table values were recognized. You can add facts manually."
                }
              />
            </div>
          )}
        </SectionCard>
      ) : null}

      {tab === "scans" ? (
        <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
          <SectionCard className="lg:col-span-2" title="Scan history" description="Every scan and upload, including failures">
            <ScanHistory scans={intel.scans} now={now} />
          </SectionCard>
          <SectionCard title="Version history">
            {versions.length ? (
              <ol className="grid gap-3">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-start gap-3 text-sm">
                    <span className="tabular rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">v{v.version}</span>
                    <div className="min-w-0">
                      <p className="truncate">{typeof v.summary.note === "string" ? v.summary.note : typeof v.summary.fileName === "string" ? v.summary.fileName : typeof v.summary.title === "string" ? v.summary.title : "Content captured"}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</p>
                      {v.contentHash ? <p className="truncate font-mono text-[10px] text-muted-foreground">{v.contentHash.slice(0, 16)}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No versions captured yet.</p>
            )}
          </SectionCard>
        </div>
      ) : null}

      {tab === "overview" ? (
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="grid gap-6 lg:col-span-2">
          <SourcePanel asset={asset} workspaceId={ctx.workspace.id} canWrite={canWrite} isDemo={isDemo} now={now} />
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
          <SectionCard title="Content" description={latestVersion ? `Version v${latestVersion.version} · ${formatDateTime(latestVersion.createdAt)}` : undefined}>
            <ContentSummary version={latestVersion} />
          </SectionCard>
        </div>
      </div>
      ) : null}
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

const ACCEPT: Record<Asset["type"], string> = {
  website: ".pdf,.csv,.tsv,.txt,.md",
  pdf: ".pdf",
  csv: ".csv,.tsv",
  manual: "",
  product_catalog: ".pdf,.csv,.tsv,.txt,.md",
  marketing_content: ".pdf,.txt,.md,.csv,.tsv",
};

function SourcePanel({ asset, workspaceId, canWrite, isDemo, now }: { asset: Asset; workspaceId: string; canWrite: boolean; isDemo: boolean; now: Date }) {
  const scannable = Boolean(asset.sourceUrl);
  const uploadable = asset.type !== "manual" && asset.type !== "website";
  return (
    <SectionCard
      title="Source"
      description={asset.lastScannedAt ? `Last read ${relativeTime(asset.lastScannedAt, now)}` : asset.type === "manual" ? "Facts entered by people" : "Not read yet"}
      action={<StatusPill meta={SCAN_STATUS_META[asset.scanStatus]} size="xs" />}
    >
      {!canWrite ? (
        <p className="text-sm text-muted-foreground">Editors and admins can upload files, scan pages and add facts.</p>
      ) : asset.type === "manual" ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Manual records are not scanned. Add facts such as opening hours, phone numbers or prices.</p>
          <AddFactDialog workspaceId={workspaceId} assetId={asset.id} defaultEntity={asset.name} />
        </div>
      ) : (
        <div className={cn("grid gap-5", scannable && uploadable && "md:grid-cols-2")}>
          {scannable ? (
            <div className="grid content-start gap-3">
              <div>
                <p className="text-sm font-medium">Scan the web page</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Reads one public page (no crawling, no JavaScript). Private and internal addresses are blocked. Limits: 2 MB, 10 s.</p>
              </div>
              {isDemo ? (
                <p className="flex gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
                  <FlaskConical className="mt-0.5 size-3.5 shrink-0" />
                  Demo mode does not fetch external websites. Upload a file instead, or create an account to scan real pages.
                </p>
              ) : (
                <ScanButton workspaceId={workspaceId} assetId={asset.id} label={asset.lastScannedAt ? "Scan again" : "Scan now"} />
              )}
            </div>
          ) : null}
          {uploadable || !scannable ? (
            <div className="grid content-start gap-3">
              <div>
                <p className="text-sm font-medium">Upload a new version</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  PDF, CSV or text, up to 10 MB. {isDemo ? "In demo mode files are analyzed in memory and not stored." : "Originals are kept in private storage."}
                </p>
              </div>
              <UploadForm workspaceId={workspaceId} assetId={asset.id} accept={ACCEPT[asset.type]} hint={ACCEPT[asset.type].replaceAll(",", " ")} />
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
