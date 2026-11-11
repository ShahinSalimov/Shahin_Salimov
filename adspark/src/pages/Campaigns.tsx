import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, FileJson, FolderOpen, LayoutGrid, List, Pencil, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import { useApp } from '../store/app';
import { PLATFORMS, type Campaign } from '../lib/schemas';
import { createProjectFile, ImportError, MAX_IMPORT_BYTES, parseImport } from '../lib/backup';
import { downloadText, safeFileName } from '../lib/export/download';
import { Badge, Button, ButtonLink, Card, ConfirmModal, EmptyState, IconButton, Modal, PageHeader, TextField, cx } from '../components/ui';
import { campaignHref, campaignStage, relativeTime } from '../lib/campaignMeta';
import { CampaignCard } from '../components/CampaignCard';

const VIEW_KEY = 'adspark:campaigns-view';

export default function Campaigns() {
  const campaigns = useApp((s) => s.campaigns);
  const duplicate = useApp((s) => s.duplicateCampaign);
  const remove = useApp((s) => s.deleteCampaign);
  const rename = useApp((s) => s.renameCampaign);
  const importData = useApp((s) => s.importData);
  const toast = useApp((s) => s.toast);
  const addDemo = useApp((s) => s.addDemoCampaign);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('');
  const [sort, setSort] = useState<'updated' | 'name' | 'created'>('updated');
  const [renaming, setRenaming] = useState<Campaign | null>(null);
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [view, setViewState] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const setView = (v: 'grid' | 'list') => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* preference only */
    }
  };

  const actionsFor = (c: Campaign) => (
    <>
      <IconButton
        label={`Rename ${c.name}`}
        onClick={() => {
          setNewName(c.name);
          setRenaming(c);
        }}
      >
        <Pencil className="size-4" />
      </IconButton>
      <IconButton
        label={`Duplicate ${c.name}`}
        onClick={() => {
          const copy = duplicate(c.id);
          if (copy) toast('success', `Created “${copy.name}”.`);
        }}
      >
        <Copy className="size-4" />
      </IconButton>
      <IconButton label={`Export ${c.name} as JSON`} onClick={() => downloadText(JSON.stringify(createProjectFile(c), null, 2), safeFileName(c.name, 'adspark.json'), 'application/json')}>
        <FileJson className="size-4" />
      </IconButton>
      <IconButton label={`Delete ${c.name}`} className="hover:text-danger" onClick={() => setDeleting(c)}>
        <Trash2 className="size-4" />
      </IconButton>
    </>
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns
      .filter((c) => (!platform || c.input.platform === platform) && (!q || c.name.toLowerCase().includes(q) || c.input.productName.toLowerCase().includes(q)))
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt));
  }, [campaigns, query, platform, sort]);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      toast('error', 'The file is larger than 10 MB.');
      return;
    }
    try {
      const result = parseImport(await file.text());
      const n = await importData(result.campaigns, result.brands);
      toast('success', `Imported ${n.campaigns} campaign(s)${n.brands ? ` and ${n.brands} brand profile(s)` : ''}.${result.skipped ? ` ${result.skipped} invalid record(s) skipped.` : ''}`);
    } catch (e) {
      toast('error', e instanceof ImportError ? e.message : 'The file could not be imported.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="My campaigns"
        title="Saved campaigns"
        description="Everything is stored locally in this browser."
        actions={
          <>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" id="import-file" onChange={(e) => onImport(e.target.files?.[0])} />
            <Button variant="ghost" onClick={async () => { await addDemo(); toast('success', 'Sample campaign added.'); }}>
              Add sample campaign
            </Button>
            <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
              Import JSON
            </Button>
            <ButtonLink to="/app/new" icon={<Sparkles className="size-4" />}>
              Create Campaign
            </ButtonLink>
          </>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState icon={<FolderOpen className="size-6" />} title="No saved campaigns" description="Campaigns you create are saved here automatically. You can also import an AdSpark project or backup file." action={<ButtonLink to="/app/new">Create a campaign</ButtonLink>} />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <label htmlFor="search" className="sr-only">
                Search campaigns
              </label>
              <input id="search" className="input pl-9" placeholder="Search by name or product" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <label htmlFor="platform-filter" className="sr-only">
              Filter by platform
            </label>
            <select id="platform-filter" className="input sm:w-48" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">All platforms</option>
              {PLATFORMS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <label htmlFor="sort" className="sr-only">
              Sort campaigns
            </label>
            <select id="sort" className="input sm:w-44" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="updated">Last edited</option>
              <option value="created">Newest</option>
              <option value="name">Name A–Z</option>
            </select>
            <div role="group" aria-label="Layout" className="flex shrink-0 rounded-xl border border-line bg-surface p-1">
              {(['grid', 'list'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  aria-label={v === 'grid' ? 'Card view' : 'List view'}
                  onClick={() => setView(v)}
                  className={cx('flex size-8 items-center justify-center rounded-lg transition-colors', view === v ? 'bg-elevated text-ink' : 'text-muted hover:text-ink')}
                >
                  {v === 'grid' ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
                </button>
              ))}
            </div>
          </div>

          {list.length === 0 ? (
            <Card className="px-6 py-10 text-center text-sm text-muted">No campaigns match your filters.</Card>
          ) : view === 'grid' ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((c) => (
                <CampaignCard key={c.id} c={c} actions={actionsFor(c)} />
              ))}
            </div>
          ) : (
            <Card className="divide-y divide-line/70">
              {list.map((c) => {
                const stage = campaignStage(c);
                return (
                  <div key={c.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                    <Link to={campaignHref(c)} className="min-w-0 flex-1 rounded-lg">
                      <p className="truncate font-medium hover:text-secondary">{c.name}</p>
                      <p className="truncate text-xs text-muted">
                        {c.input.productName} · {c.input.platform} · {c.input.duration}s · {c.input.language} · edited {relativeTime(c.updatedAt)}
                      </p>
                    </Link>
                    <div className="flex items-center gap-1">
                      <Badge tone={stage.tone} className="mr-2">
                        {stage.label}
                      </Badge>
                      {actionsFor(c)}
                      <Button size="sm" variant="secondary" className="ml-1" onClick={() => navigate(campaignHref(c))}>
                        Open
                      </Button>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </>
      )}

      <Modal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title="Rename campaign"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="rename-form"
              disabled={!newName.trim()}
            >
              Save
            </Button>
          </>
        }
      >
        <form
          id="rename-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (renaming && newName.trim()) {
              rename(renaming.id, newName);
              setRenaming(null);
            }
          }}
        >
          <TextField label="Campaign name" value={newName} maxLength={120} autoFocus onChange={(e) => setNewName(e.target.value)} />
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleting}
        title="Delete campaign?"
        message={
          <>
            “{deleting?.name}” and its concepts, script, storyboard, voiceover and captions will be permanently deleted from this browser. Export it first if you may need it later.
          </>
        }
        confirmLabel="Delete permanently"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) {
            await remove(deleting.id);
            toast('success', 'Campaign deleted.');
          }
        }}
      />
    </>
  );
}
