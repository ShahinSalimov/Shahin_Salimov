"use client";

import { useState } from "react";
import { Loader2, ScanSearch, Sparkles, Zap } from "lucide-react";
import { useMutation } from "@/components/forms/use-mutation-feedback";
import { Button } from "@/components/ui/button";
import { analyzeChangeAction, detectInconsistenciesAction } from "@/server/workspaces/change-actions";

export function AnalyzeButton({ workspaceId, changeId, analyzed, ai }: { workspaceId: string; changeId: string; analyzed: boolean; ai: { available: boolean; model: string | null; reason: string | null } }) {
  const [useAi, setUseAi] = useState(false);
  const [, action, pending] = useMutation(analyzeChangeAction);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="changeId" value={changeId} />
      {ai.available ? (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Claude improves recommendations; the affected assets are always computed by rules.">
          <input type="checkbox" name="useAi" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="size-3.5 accent-[var(--primary)]" />
          <Sparkles className="size-3.5" aria-hidden="true" />
          Use AI ({ai.model})
        </label>
      ) : (
        <span className="text-xs text-muted-foreground" title={ai.reason ?? undefined}>
          Rule-based analysis · AI off
        </span>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Zap />}
        {pending ? (useAi ? "Analyzing with AI…" : "Analyzing…") : analyzed ? "Re-run analysis" : "Run impact analysis"}
      </Button>
    </form>
  );
}

export function DetectInconsistenciesButton({ workspaceId }: { workspaceId: string }) {
  const [, action, pending] = useMutation(detectInconsistenciesAction);
  return (
    <form action={action}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <ScanSearch />}
        {pending ? "Comparing assets…" : "Detect inconsistencies"}
      </Button>
    </form>
  );
}
