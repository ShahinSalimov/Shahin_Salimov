import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, SearchX } from "lucide-react";
import { AssetIcon } from "@/components/app/asset-icon";
import { EmptyState } from "@/components/app/empty-state";
import { FilterChips, SearchForm, str, withParams } from "@/components/app/filters";
import { ASSET_TYPE_META, HEALTH_META, SCAN_STATUS_META } from "@/components/app/meta";
import { PageHeader } from "@/components/app/page-header";
import { SampleTag, StatusPill } from "@/components/app/status-pill";
import { CreateAssetDialog } from "@/components/forms/create-asset-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { assetHealth, type AssetHealth } from "@/domain/insights/metrics";
import { can } from "@/domain/rbac/roles";
import { ASSET_TYPES, type AssetType } from "@/domain/workspace/model";
import { formatBytes, formatDateTime, relativeTime } from "@/lib/format";
import { loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Assets" };

export default async function AssetsPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const ctx = await loadWorkspace(workspaceId);
  const snapshot = await loadSnapshot(ctx);
  const base = `/w/${ctx.workspace.id}`;
  const path = `${base}/assets`;
  const now = new Date();

  const type = ASSET_TYPES.find((t) => t === str(sp.type));
  const health = (Object.keys(HEALTH_META) as AssetHealth[]).find((h) => h === str(sp.health));
  const q = str(sp.q)?.toLowerCase();
  const current = { type, health, q: str(sp.q) };

  const rows = snapshot.assets
    .filter((a) => a.status === "active")
    .map((a) => ({
      asset: a,
      health: assetHealth(a, snapshot),
      links: snapshot.relationships.filter((r) => r.status === "confirmed" && (r.sourceAssetId === a.id || r.targetAssetId === a.id)).length,
    }));
  const filtered = rows.filter(
    (r) =>
      (!type || r.asset.type === type) &&
      (!health || r.health === health) &&
      (!q || r.asset.name.toLowerCase().includes(q) || (r.asset.sourceUrl ?? "").toLowerCase().includes(q)),
  );
  const countBy = (t: AssetType) => rows.filter((r) => r.asset.type === t).length;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Assets"
        description="Every place where your business information is published or stored."
        actions={can(ctx.role, "assets.write") ? <CreateAssetDialog workspaceId={ctx.workspace.id} /> : null}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No assets yet"
          description="Register websites, PDFs, spreadsheets, catalogs, marketing content or manual records."
          action={can(ctx.role, "assets.write") ? <CreateAssetDialog workspaceId={ctx.workspace.id} /> : undefined}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <FilterChips
              label="Asset type"
              active={type ?? "all"}
              options={[
                { value: "all", label: "All", count: rows.length, href: withParams(path, current, { type: undefined }) },
                ...ASSET_TYPES.filter((t) => countBy(t) > 0).map((t) => ({ value: t, label: ASSET_TYPE_META[t].plural, count: countBy(t), href: withParams(path, current, { type: t }) })),
              ]}
            />
            <SearchForm action={path} defaultValue={current.q} placeholder="Search name or URL" keep={{ type, health }} />
          </div>
          {health ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Health:</span>
              <StatusPill meta={HEALTH_META[health]} />
              <Link href={withParams(path, current, { health: undefined })} className="text-xs font-medium text-primary hover:underline">
                Clear
              </Link>
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <EmptyState icon={SearchX} title="No assets match these filters" action={<Link className="text-sm font-medium text-primary hover:underline" href={path}>Reset filters</Link>} />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Asset</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead className="hidden lg:table-cell">Last scan</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Links</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(({ asset, health: h, links }) => (
                    <TableRow key={asset.id} className="relative">
                      <TableCell className="max-w-[20rem]">
                        <div className="flex items-center gap-3">
                          <AssetIcon type={asset.type} />
                          <div className="min-w-0">
                            <Link href={`${base}/assets/${asset.id}`} className="block truncate font-medium after:absolute after:inset-0 hover:underline focus-visible:outline-2">
                              {asset.name}
                            </Link>
                            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                              {asset.origin === "demo" ? <SampleTag /> : null}
                              <span className="truncate">{asset.sourceUrl ?? (asset.sizeBytes ? formatBytes(asset.sizeBytes) : asset.description ?? "—")}</span>
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{ASSET_TYPE_META[asset.type].label}</TableCell>
                      <TableCell>
                        <StatusPill meta={HEALTH_META[h]} size="xs" />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-col gap-0.5">
                          <StatusPill meta={SCAN_STATUS_META[asset.scanStatus]} size="xs" />
                          <span className="text-xs text-muted-foreground" title={formatDateTime(asset.lastScannedAt)}>
                            {relativeTime(asset.lastScannedAt, now)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="tabular hidden text-right sm:table-cell">{links}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
                Showing {filtered.length} of {rows.length} assets
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
