"use client";

import * as React from "react";
import { DropdownMenu as DM } from "radix-ui";
import { cn } from "@/lib/utils";

const DropdownMenu = DM.Root;
const DropdownMenuTrigger = DM.Trigger;
const DropdownMenuGroup = DM.Group;

function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[12rem] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}
function DropdownMenuItem({ className, inset, ...props }: React.ComponentProps<typeof DM.Item> & { inset?: boolean }) {
  return (
    <DM.Item
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  );
}
function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)} {...props} />;
}
function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup };
