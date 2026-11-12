"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Keeps the workspace shell (navigation) when a single page fails to load. */
export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed px-4 py-10 text-center">
      <AlertTriangle className="size-6 text-warning" aria-hidden="true" />
      <h1 className="text-lg font-semibold">This page could not be loaded</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Your data was not changed. Try again, or use the navigation to open another page.{error.digest ? ` Reference: ${error.digest}` : ""}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
