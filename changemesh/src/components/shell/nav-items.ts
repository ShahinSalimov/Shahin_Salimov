import { Activity, Boxes, CheckSquare, GitBranch, LayoutDashboard, Plug, Settings, Waypoints, type LucideIcon } from "lucide-react";
import type { Messages } from "@/i18n/messages";

export type NavKey = "overview" | "assets" | "changeMap" | "changes" | "approvals" | "integrations" | "activity" | "settings";

export interface NavItem {
  key: NavKey;
  href: string;
  icon: LucideIcon;
  /** Extra path prefixes that should highlight this item. */
  match: string[];
}

export function navItems(workspaceId: string): NavItem[] {
  const base = `/w/${workspaceId}`;
  return [
    { key: "overview", href: base, icon: LayoutDashboard, match: [] },
    { key: "assets", href: `${base}/assets`, icon: Boxes, match: [`${base}/assets`] },
    { key: "changeMap", href: `${base}/graph`, icon: Waypoints, match: [`${base}/graph`] },
    { key: "changes", href: `${base}/changes`, icon: GitBranch, match: [`${base}/changes`] },
    { key: "approvals", href: `${base}/approvals`, icon: CheckSquare, match: [`${base}/approvals`, `${base}/proposals`, `${base}/updates`] },
    { key: "integrations", href: `${base}/integrations`, icon: Plug, match: [`${base}/integrations`] },
    { key: "activity", href: `${base}/activity`, icon: Activity, match: [`${base}/activity`] },
    { key: "settings", href: `${base}/settings`, icon: Settings, match: [`${base}/settings`] },
  ];
}

export type NavLabels = Messages["nav"];
