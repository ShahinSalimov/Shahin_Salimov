import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center", className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 -m-3 rounded-full bg-primary/5" aria-hidden="true" />
        <div className="relative grid size-11 place-items-center rounded-xl border bg-card text-muted-foreground shadow-sm">
          <Icon className="size-5" aria-hidden="true" />
        </div>
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
