"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { NavLabels } from "./nav-items";

export interface SwitcherWorkspace {
  id: string;
  name: string;
  organizationName: string;
}

export function WorkspaceSwitcher({ current, workspaces, labels, isDemo }: { current: SwitcherWorkspace; workspaces: SwitcherWorkspace[]; labels: NavLabels; isDemo: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-lg border bg-background/60 px-2.5 py-2 text-left shadow-xs transition-colors hover:bg-sidebar-accent focus-visible:outline-2" aria-label={labels.switchWorkspace}>
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">{current.name.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-tight font-semibold">{current.name}</span>
          <span className="block truncate text-[11px] leading-tight text-muted-foreground">{current.organizationName}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{labels.switchWorkspace}</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} asChild>
            <Link href={`/w/${w.id}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{w.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{w.organizationName}</span>
              </span>
              {w.id === current.id ? <Check className="!text-primary" aria-label="Current" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        {isDemo ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/onboarding">
                <Plus />
                {labels.newOrganization}
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
