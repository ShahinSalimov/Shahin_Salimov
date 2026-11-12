import Link from "next/link";
import { cn } from "@/lib/utils";

export function ApprovalsNav({ base, active, counts }: { base: string; active: "center" | "proposals" | "history"; counts?: { ready?: number } }) {
  const items = [
    { key: "center", label: "Approval Center", href: `${base}/approvals` },
    { key: "proposals", label: "All proposals", href: `${base}/proposals` },
    { key: "history", label: "Update history", href: `${base}/updates` },
  ] as const;
  return (
    <nav aria-label="Approvals" className="flex gap-1 overflow-x-auto border-b">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={i.key === active ? "page" : undefined}
          className={cn("-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground", i.key === active && "border-primary text-foreground")}
        >
          {i.label}
          {i.key === "center" && counts?.ready ? <span className="ml-1.5 rounded bg-primary/10 px-1.5 text-xs text-primary">{counts.ready} ready</span> : null}
        </Link>
      ))}
    </nav>
  );
}
