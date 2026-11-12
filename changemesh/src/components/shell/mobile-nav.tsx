"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavKey, NavLabels } from "./nav-items";
import { SidebarNav } from "./sidebar-nav";
import { WorkspaceSwitcher, type SwitcherWorkspace } from "./workspace-switcher";

export function MobileNav(props: { workspaceId: string; labels: NavLabels; counts: Partial<Record<NavKey, number>>; current: SwitcherWorkspace; workspaces: SwitcherWorkspace[]; isDemo: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={props.labels.openMenu}>
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="gap-4 p-4">
        <SheetTitle className="sr-only">{props.labels.openMenu}</SheetTitle>
        <SheetDescription className="sr-only">{props.current.name}</SheetDescription>
        <div className="pt-1">
          <Logo href={`/w/${props.workspaceId}`} />
        </div>
        <WorkspaceSwitcher current={props.current} workspaces={props.workspaces} labels={props.labels} isDemo={props.isDemo} />
        <SidebarNav workspaceId={props.workspaceId} labels={props.labels} counts={props.counts} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
