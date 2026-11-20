import { useCallback, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Download, FileJson, FileText, Printer, SearchX, TriangleAlert, Lightbulb, ScrollText, Clapperboard, Mic, Share2 } from 'lucide-react';
import { useApp } from '../store/app';
import type { Campaign } from '../lib/schemas';
import { localProvider, type GenerationProvider } from '../lib/ai/provider';
import { campaignToText } from '../lib/export/txt';
import { createProjectFile } from '../lib/backup';
import { downloadBlob, downloadText, safeFileName } from '../lib/export/download';
import { Badge, Button, ButtonLink, cx, EmptyState } from './ui';
import { Link } from 'react-router-dom';

export function CampaignMissing() {
  return (
    <EmptyState
      icon={<SearchX className="size-6" />}
      title="Campaign not found"
      description="This campaign does not exist in this browser. It may have been deleted, or it was created on another device."
      action={<ButtonLink to="/app/campaigns">Open My Campaigns</ButtonLink>}
    />
  );
}

export function GeneratorBadge({ c }: { c: Campaign }) {
  return c.generator.engine === 'ai' ? (
    <Badge tone="secondary">AI · {c.generator.provider}</Badge>
  ) : (
    <Badge tone="warning" className="whitespace-nowrap">Demo Generation · not AI</Badge>
  );
}

export function CampaignNav({ c }: { c: Campaign }) {
  const built = c.scenes.length > 0;
  const items = [
    { to: `/app/campaigns/${c.id}/concepts`, label: 'Concepts', icon: Lightbulb, enabled: true },
    { to: `/app/campaigns/${c.id}`, label: 'Script', icon: ScrollText, enabled: built, end: true },
    { to: `/app/campaigns/${c.id}/storyboard`, label: 'Storyboard', icon: Clapperboard, enabled: built },
    { to: `/app/campaigns/${c.id}/voiceover`, label: 'Voiceover', icon: Mic, enabled: built },
    { to: `/app/campaigns/${c.id}/social`, label: 'Social', icon: Share2, enabled: built },
  ];
  return (
    <nav aria-label="Campaign sections" className="no-print mb-6 grid grid-cols-5 gap-1 rounded-xl border border-line bg-surface p-1 sm:flex sm:max-w-full">
      {items.map(({ to, label, icon: Icon, enabled, end }) =>
        enabled ? (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                'flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors sm:flex-row sm:gap-2 sm:px-3 sm:text-sm',
                isActive ? 'bg-elevated text-ink' : 'text-muted hover:text-ink',
              )
            }
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </NavLink>
        ) : (
          <span
            key={to}
            className="flex min-w-0 cursor-not-allowed flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[11px] text-muted/40 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm"
            title="Choose a concept and create the full campaign first"
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </span>
        ),
      )}
    </nav>
  );
}

export function ExportMenu({ c }: { c: Campaign }) {
  const brands = useApp((s) => s.brands);
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const brand = brands.find((b) => b.id === c.input.brandId) ?? null;

  const pdf = async () => {
    setBusy(true);
    try {
      const { campaignToPdf } = await import('../lib/export/pdf');
      downloadBlob(await campaignToPdf(c, brand), safeFileName(c.name, 'pdf'));
      toast('success', 'PDF report downloaded.');
    } catch {
      toast('error', 'The PDF could not be created. Try the print-friendly version instead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" loading={busy} icon={<Download className="size-3.5" />} onClick={pdf}>
        PDF
      </Button>
      <Button variant="secondary" size="sm" icon={<FileText className="size-3.5" />} onClick={() => downloadText(campaignToText(c, brand), safeFileName(c.name, 'txt'))}>
        TXT
      </Button>
      <Button
        variant="secondary"
        size="sm"
        icon={<FileJson className="size-3.5" />}
        onClick={() => downloadText(JSON.stringify(createProjectFile(c), null, 2), safeFileName(c.name, 'adsofff.json'), 'application/json')}
      >
        JSON
      </Button>
      <Link to={`/app/campaigns/${c.id}/print`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 text-xs font-medium text-ink hover:border-primary/50">
        <Printer className="size-3.5" aria-hidden />
        Print view
      </Link>
    </div>
  );
}

/** Runs generation tasks with the active provider; on AI failure offers a local-engine retry. */
export function useGeneration() {
  const provider = useApp((s) => s.provider);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<{ key: string; task: (p: GenerationProvider) => Promise<void> } | null>(null);

  const exec = useCallback(async (key: string, task: (p: GenerationProvider) => Promise<void>, p: GenerationProvider) => {
    last.current = { key, task };
    setBusy(key);
    setError(null);
    try {
      await task(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setBusy(null);
    }
  }, []);

  const run = useCallback((key: string, task: (p: GenerationProvider) => Promise<void>) => exec(key, task, provider()), [exec, provider]);
  const retryLocal = useCallback(() => (last.current ? exec(last.current.key, last.current.task, localProvider) : Promise.resolve()), [exec]);
  const clearError = useCallback(() => setError(null), []);

  return { busy, error, run, retryLocal, clearError };
}

export function GenerationError({ error, onLocal, onDismiss }: { error: string | null; onLocal: () => void; onDismiss: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="mb-6 flex flex-col gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm sm:flex-row sm:items-center">
      <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden />
      <p className="flex-1 text-ink/90">
        <span className="font-medium text-danger">AI generation failed:</span> {error}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={onLocal}>
          Use local engine instead
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
