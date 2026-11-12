import { SCAN_STATUS_META } from "@/components/app/meta";
import { StatusPill } from "@/components/app/status-pill";
import type { AssetScan } from "@/domain/workspace/model";
import { formatDateTime, relativeTime } from "@/lib/format";

function duration(scan: AssetScan): string | null {
  if (!scan.finishedAt) return null;
  const ms = Date.parse(scan.finishedAt) - Date.parse(scan.startedAt);
  if (ms <= 0) return null;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function ScanHistory({ scans, now }: { scans: AssetScan[]; now: Date }) {
  if (!scans.length) return <p className="text-sm text-muted-foreground">No scans yet.</p>;
  return (
    <ol className="grid gap-3">
      {scans.map((s) => (
        <li key={s.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusPill meta={SCAN_STATUS_META[s.status]} size="xs" />
            <span className="font-medium">{s.kind === "website" ? "Website scan" : "File upload"}</span>
            {s.assetVersion ? <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">v{s.assetVersion}</span> : null}
            <span className="ml-auto text-xs text-muted-foreground" title={formatDateTime(s.startedAt)}>
              {relativeTime(s.startedAt, now)}
              {duration(s) ? ` · ${duration(s)}` : ""}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {s.status === "running" ? "In progress…" : `${s.factsCount} fact${s.factsCount === 1 ? "" : "s"} in this version`}
            {typeof s.stats.bytes === "number" ? ` · ${(s.stats.bytes / 1024).toFixed(0)} KB read` : ""}
            {typeof s.stats.httpStatus === "number" ? ` · HTTP ${s.stats.httpStatus}` : ""}
          </p>
          {s.status === "failed" && s.error ? <p className="mt-2 rounded-md bg-destructive/8 px-2.5 py-1.5 text-xs text-destructive">{s.error}</p> : null}
          {s.warnings.length ? (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                {s.warnings.length} warning{s.warnings.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-1.5 grid list-disc gap-1 pl-5 text-muted-foreground">
                {s.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
