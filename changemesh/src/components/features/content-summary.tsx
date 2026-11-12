import type { AssetVersion } from "@/domain/workspace/model";

type Col = { name: string; type: string; filled: number; unique: number; sample?: string[] };

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/** Renders what was read from the latest version. All values are plain text — never HTML. */
export function ContentSummary({ version }: { version: AssetVersion | undefined }) {
  if (!version) return <p className="text-sm text-muted-foreground">No content has been read yet.</p>;
  const s = version.summary;
  const kind = str(s.kind);
  const excerpt = str(s.textExcerpt);
  const columns = arr<Col>(s.columns);
  const headings = arr<{ level: number; text: string }>(s.headings);

  return (
    <div className="grid gap-4 text-sm">
      <dl className="grid grid-cols-2 gap-3">
        {str(s.fileName) ? <Item label="File" value={str(s.fileName)!} /> : null}
        {str(s.title) ? <Item label="Page title" value={str(s.title)!} /> : null}
        {kind === "pdf" ? <Item label="Pages" value={`${s.pagesRead ?? s.pages} of ${s.pages}`} /> : null}
        {kind === "csv" ? <Item label="Rows" value={`${s.validRows} of ${s.rows} readable`} /> : null}
        {kind === "csv" && str(s.entityColumn) ? <Item label="Entities" value={`${s.entityCount} ${String(s.entityKind ?? "records").toLowerCase()} in “${s.entityColumn}”`} /> : null}
        {str(s.lang) ? <Item label="Language" value={str(s.lang)!} /> : null}
        {str(s.note) ? <Item label="Note" value={str(s.note)!} /> : null}
        {kind === "pdf" && arr<number>(s.emptyPages).length ? <Item label="Pages without text" value={arr<number>(s.emptyPages).join(", ")} /> : null}
      </dl>
      {columns.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <caption className="sr-only">Detected columns</caption>
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Column</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Filled</th>
                <th className="px-3 py-2 text-right font-medium">Unique</th>
                <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Sample</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((c) => (
                <tr key={c.name} className="border-t">
                  <td className="px-3 py-2 font-medium">
                    {c.name}
                    {c.name === s.entityColumn ? <span className="ml-1.5 rounded bg-primary/10 px-1 text-[10px] text-primary">entity</span> : null}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{c.type}</td>
                  <td className="tabular px-3 py-2 text-right">{c.filled}</td>
                  <td className="tabular px-3 py-2 text-right">{c.unique}</td>
                  <td className="hidden max-w-[14rem] truncate px-3 py-2 text-muted-foreground sm:table-cell">{(c.sample ?? []).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {headings.length ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Headings</p>
          <ul className="grid gap-1">
            {headings.slice(0, 12).map((h, i) => (
              <li key={i} className="truncate" style={{ paddingLeft: `${(h.level - 1) * 12}px` }}>
                <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">H{h.level}</span>
                {h.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {excerpt ? (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">Extracted text (first {excerpt.length.toLocaleString("en")} characters)</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-lg border bg-muted/40 p-3 font-sans text-xs whitespace-pre-wrap">{excerpt}</pre>
        </details>
      ) : null}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}
