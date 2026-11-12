"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { MarkNotificationsRead } from "@/components/forms/commercial-forms";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NotificationView } from "@/server/commercial/views";

export function NotificationsMenu({ workspaceId, items }: { workspaceId: string; items: NotificationView[] }) {
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
          <Bell />
          {unread ? (
            <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground" data-testid="notification-count">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unread ? <MarkNotificationsRead workspaceId={workspaceId} label="Mark all read" /> : null}
        </div>
        <DropdownMenuSeparator className="m-0" />
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id} className={cn("grid gap-0.5 border-b px-3 py-2.5 text-sm last:border-b-0", !n.readAt && "bg-accent/40")}>
                <div className="flex items-start justify-between gap-2">
                  {n.link ? (
                    <Link href={n.link} className="font-medium hover:underline">
                      {n.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{n.title}</span>
                  )}
                  <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</span>
                </div>
                {n.body ? <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p> : null}
                {!n.readAt ? (
                  <div className="-ml-2">
                    <MarkNotificationsRead workspaceId={workspaceId} notificationId={n.id} label="Mark read" />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
