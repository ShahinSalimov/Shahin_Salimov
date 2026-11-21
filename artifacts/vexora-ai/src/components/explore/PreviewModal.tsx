import { Copy, Heart, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { GenerativeArt } from '@/components/media/GenerativeArt';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getModel } from '@/data/models';
import { compact } from '@/lib/format';
import { useApp } from '@/store/AppStore';
import type { ExploreItem } from '@/types';

export function PreviewModal({ item, onClose }: { item: ExploreItem | null; onClose: () => void }) {
  const { remix } = useApp();
  const [copied, setCopied] = useState(false);
  if (!item) return null;
  const model = getModel(item.modelId);
  const copy = async () => {
    try { await navigator.clipboard.writeText(item.prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <Modal open onClose={onClose} title={item.title} className="max-w-5xl">
      <div className="grid md:grid-cols-[1.3fr_1fr]">
        <div className="bg-ink-950 p-4 md:p-6 grid place-items-center">
          <GenerativeArt seed={item.seed} aspect={item.aspect} kind={item.kind} animate={item.kind === 'video'} className="max-h-[70vh] w-auto max-w-full rounded-2xl" />
        </div>
        <div className="flex flex-col gap-5 p-6">
          <div className="flex flex-wrap gap-2 pr-10">
            <Badge tone="red">{item.kind === 'video' ? `Video · ${item.durationSec}s` : 'Şəkil'}</Badge>
            <Badge tone="yellow">{model.name}</Badge>
            <Badge>{item.aspect}</Badge>
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold">{item.title}</h2>
            <p className="text-sm text-muted">@{item.author}</p>
          </div>
          <div className="rounded-2xl bg-ink-900 p-4 ring-1 ring-ink-700">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-volt-400">Prompt</span>
              <button onClick={copy} className="flex items-center gap-1 text-xs text-muted hover:text-volt-300 cursor-pointer"><Copy size={12} /> {copied ? 'Kopyalandı' : 'Kopyala'}</button>
            </div>
            <p className="font-mono text-sm leading-relaxed text-cream/90">{item.prompt}</p>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[['Bəyənmə', compact(item.likes)], ['Remix', compact(item.remixes)], ['Seed', String(item.seed % 100000)]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-ink-800 p-3"><dt className="text-[11px] text-ink-400">{k}</dt><dd className="font-mono text-sm">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-auto flex gap-2">
            <Button size="lg" className="flex-1" onClick={() => { remix(item.prompt); onClose(); }}><Wand2 size={18} /> Bu prompt ilə yarat</Button>
            <Button size="lg" variant="outline" aria-label="Bəyən"><Heart size={18} /></Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
