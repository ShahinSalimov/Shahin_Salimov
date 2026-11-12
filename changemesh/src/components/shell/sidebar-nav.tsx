"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItems, type NavKey, type NavLabels } from "./nav-items";

export function SidebarNav({ workspaceId, labels, counts, onNavigate }: { workspaceId: string; labels: NavLabels; counts: Partial<Record<NavKey, number>>; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = navItems(workspaceId);
  return (
    <nav aria-label="Main" className="grid gap-0.5">
      {items.map((item) => {
        const active = item.match.length ? item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`)) : pathname === item.href;
        const Icon = item.icon;
        const count = counts[item.key];
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2",
              active && "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_var(--sidebar-border)]",
            )}
          >
            <Icon className={cn("size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground", active && "text-primary group-hover:text-primary")} aria-hidden="true" />
            <span className="truncate">{labels[item.key]}</span>
            {count ? (
              <span className="tabular ml-auto rounded-md bg-primary/12 px-1.5 text-[11px] leading-5 font-semibold text-primary" aria-label={`${count} open`}>
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
