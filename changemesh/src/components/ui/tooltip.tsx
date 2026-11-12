"use client";

import * as React from "react";
import { Tooltip as TP } from "radix-ui";
import { cn } from "@/lib/utils";

function Tooltip({ children, content, side = "top" }: { children: React.ReactNode; content: React.ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <TP.Provider delayDuration={200}>
      <TP.Root>
        <TP.Trigger asChild>{children}</TP.Trigger>
        <TP.Portal>
          <TP.Content side={side} sideOffset={6} className={cn("z-50 max-w-xs rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md animate-in fade-in-0")}>
            {content}
          </TP.Content>
        </TP.Portal>
      </TP.Root>
    </TP.Provider>
  );
}

export { Tooltip };
