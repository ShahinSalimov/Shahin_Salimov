import type { AssetType } from "@/domain/workspace/model";
import { cn } from "@/lib/utils";
import { ASSET_TYPE_META } from "./meta";

export function AssetIcon({ type, className }: { type: AssetType; className?: string }) {
  const Icon = ASSET_TYPE_META[type].icon;
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground", className)} title={ASSET_TYPE_META[type].label}>
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}
