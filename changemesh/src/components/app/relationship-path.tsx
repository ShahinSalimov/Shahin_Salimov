import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { RelationshipPathStep } from "@/domain/workspace/model";
import { RELATIONSHIP_LABEL } from "./meta";

/** Renders "Price list → derived from → Menu PDF → references → Campaign deck". */
export function RelationshipPath({ path, names, base }: { path: RelationshipPathStep[]; names: Map<string, string>; base: string }) {
  if (!path.length) return <span className="text-xs text-muted-foreground">Path not recorded</span>;
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Relationship path">
      {path.map((step, i) => (
        <li key={`${step.assetId}-${i}`} className="flex items-center gap-1">
          {i > 0 ? (
            <>
              <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground italic">{RELATIONSHIP_LABEL[step.relationship]}</span>
              <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
            </>
          ) : null}
          <Link href={`${base}/assets/${step.assetId}`} className="max-w-[16rem] truncate rounded border bg-background px-1.5 py-0.5 font-medium hover:border-primary/40 hover:text-primary">
            {names.get(step.assetId) ?? "Unknown asset"}
          </Link>
        </li>
      ))}
    </ol>
  );
}
