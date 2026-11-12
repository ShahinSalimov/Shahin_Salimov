"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import { Avatar } from "@/components/app/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { NavLabels } from "./nav-items";

export function UserMenu({ name, email, id, settingsHref, isDemo, labels, signOutLabel }: { name: string | null; email: string; id: string; settingsHref: string; isDemo: boolean; labels: NavLabels; signOutLabel: string }) {
  const { theme, setTheme } = useTheme();
  const themes = [
    { key: "light", label: labels.light, icon: Sun },
    { key: "dark", label: labels.dark, icon: Moon },
    { key: "system", label: labels.system, icon: Monitor },
  ] as const;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-muted focus-visible:outline-2" aria-label={labels.account}>
        <Avatar name={name ?? email} id={id} className="size-8" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium text-foreground">{name ?? email}</span>
          <span className="block truncate text-xs">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={settingsHref}>
            <Settings />
            {labels.settings}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{labels.theme}</DropdownMenuLabel>
        <div className="grid grid-cols-3 gap-1 px-1 pb-1" role="group" aria-label={labels.theme}>
          {themes.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTheme(t.key)}
              aria-pressed={theme === t.key}
              className={cn("flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted", theme === t.key && "border-primary/50 bg-accent text-foreground")}
            >
              <t.icon className="size-3.5" aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
        <DropdownMenuSeparator />
        <form action={isDemo ? "/demo/exit" : "/auth/signout"} method="post">
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut />
              {signOutLabel}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
