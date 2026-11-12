import Link from "next/link";
import { cn } from "@/lib/utils";

export type SettingsSection = "general" | "organization" | "team" | "api" | "billing" | "usage";

export function SettingsNav({ base, active }: { base: string; active: SettingsSection }) {
  const items = [
    { key: "general", label: "General", href: `${base}/settings` },
    { key: "organization", label: "Organization", href: `${base}/settings/organization` },
    { key: "team", label: "Team", href: `${base}/settings/team` },
    { key: "api", label: "API keys", href: `${base}/settings/api` },
    { key: "billing", label: "Billing & plan", href: `${base}/settings/billing` },
    { key: "usage", label: "Usage", href: `${base}/settings/usage` },
  ] as const;
  return (
    <nav aria-label="Settings" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 border-b">
        {items.map((i) => (
          <Link
            key={i.key}
            href={i.href}
            aria-current={i.key === active ? "page" : undefined}
            className={cn("-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground", i.key === active && "border-primary text-foreground")}
          >
            {i.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
