import Link from "next/link";
import { cn } from "@/lib/utils";

export function SettingsNav({ base, active }: { base: string; active: "general" | "team" | "billing" }) {
  const items = [
    { key: "general", label: "General", href: `${base}/settings` },
    { key: "team", label: "Team", href: `${base}/settings/team` },
    { key: "billing", label: "Billing & plan", href: `${base}/settings/billing` },
  ] as const;
  return (
    <nav aria-label="Settings" className="flex gap-1 border-b">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={i.key === active ? "page" : undefined}
          className={cn("-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground", i.key === active && "border-primary text-foreground")}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
