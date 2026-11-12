import Link from "next/link";
import { Bot } from "lucide-react";
import { Avatar } from "@/components/app/avatar";
import type { ActivityItem } from "@/domain/insights/activity";
import { formatDateTime, relativeTime } from "@/lib/format";

export function ActivityFeed({ items, now }: { items: ActivityItem[]; now: Date }) {
  return (
    <ol className="relative grid gap-0">
      {items.map((item, idx) => (
        <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
          {idx < items.length - 1 ? <span className="absolute top-8 bottom-0 left-[13.5px] w-px bg-border" aria-hidden="true" /> : null}
          {item.isSystem ? (
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
              <Bot className="size-3.5" />
            </span>
          ) : (
            <Avatar name={item.actor} id={item.actor} />
          )}
          <div className="min-w-0 flex-1 pt-0.5 text-sm leading-snug">
            <span className="font-medium">{item.actor}</span> <span className="text-muted-foreground">{item.verb}</span>{" "}
            {item.target ? (
              item.targetHref ? (
                <Link href={item.targetHref} className="font-medium underline-offset-4 hover:underline">
                  {item.target}
                </Link>
              ) : (
                <span className="font-medium">{item.target}</span>
              )
            ) : null}
            <div className="mt-0.5 text-xs text-muted-foreground">
              <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
                {relativeTime(item.createdAt, now)}
              </time>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
