import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Native <select>: best accessibility and mobile behaviour, styled to match inputs. */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-input bg-transparent pr-8 pl-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/20 [&>option]:bg-popover",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

export { NativeSelect };
