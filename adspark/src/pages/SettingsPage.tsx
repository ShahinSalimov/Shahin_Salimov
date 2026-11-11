import { useRef, useState } from 'react';
import { Cpu, Database, Download, RefreshCw, ShieldCheck, Trash2, Upload, CircleCheck, CircleSlash } from 'lucide-react';
import { useApp } from '../store/app';
import { STANDALONE } from '../lib/edition';
import { createBackup, ImportError, MAX_IMPORT_BYTES, parseImport } from '../lib/backup';
import { downloadText } from '../lib/export/download';
import { Badge, Button, Card, ConfirmModal, PageHeader } from '../components/ui';

export default function SettingsPage() {
  const ai = useApp((s) => s.ai);
  const status = useApp((s) => s.aiStatus);
  const setAi = useApp((s) => s.setAi);
  const refresh = useApp((s) => s.refreshAiStatus);
  const campaigns = useApp((s) => s.campaigns);
  const brands = useApp((s) => s.brands);
  const importData = useApp((s) => s.importData);
  const clearAll = useApp((s) => s.clearAllData);
  const toast = useApp((s) => s.toast);
  const [checking, setChecking] = useState(false);
  const [consent, setConsent] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const available = !!status?.enabled;
  const active = ai.enabled && !!ai.consentAt && available;

  const onRestore = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      toast('error', 'The file is larger than 10 MB.');
      return;
    }
    try {
      const r = parseImport(await file.text());
      const n = await importData(r.campaigns, r.brands);
      toast('success', `Restored ${n.campaigns} campaign(s) and ${n.brands} brand profile(s).${r.skipped ? ` ${r.skipped} invalid record(s) skipped.` : ''}`);
    } catch (e) {
      toast('error', e instanceof ImportError ? e.message : 'The backup could not be restored.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings" description="Generation engine, backups and privacy controls." />

      <div className="grid max-w-4xl gap-6">
        <Card as="section" className="scroll-mt-20 p-6">
          <div id="ai" className="flex flex-wrap items-center gap-3">
            <Cpu className="size-5 text-secondary" aria-hidden />
            <h2 className="text-lg font-semibold">Generation engine</h2>
            <Badge tone={active ? 'secondary' : 'default'} className="ml-auto">
              {active ? `AI · ${status?.provider}` : 'Demo Generation'}
            </Badge>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Demo Generation is AdSpark’s local template engine. It builds campaigns from proven advertising structures and your product details. It runs entirely in your browser, works offline, and is not AI.
            Optional AI generation needs the AdSpark server running with your own provider key (see INSTALLATION.md). Keys stay on the server and are never sent to the browser.
          </p>

          {STANDALONE ? (
            <p className="mt-5 rounded-xl border border-line/70 bg-bg/50 p-4 text-sm text-muted">
              This is the offline edition: everything runs in this browser and nothing is sent anywhere. Connecting an AI provider needs the AdSpark server
              (developer setup), which is not part of this edition.
            </p>
          ) : (
          <div className="mt-5 rounded-xl border border-line/70 bg-bg/50 p-4">
            <div className="flex flex-wrap items-center gap-3">
              {available ? <CircleCheck className="size-4 text-success" aria-hidden /> : <CircleSlash className="size-4 text-muted" aria-hidden />}
              <p className="flex-1 text-sm">
                {available ? (
                  <>
                    AI provider available: <span className="font-medium">{status?.provider}</span>
                    {status?.model ? ` (${status.model})` : ''}
                    {typeof status?.remainingToday === 'number' ? ` · ${status.remainingToday} requests left today` : ''}
                  </>
                ) : (
                  <>AI provider not available{status?.reason ? `: ${status.reason}` : '.'}</>
                )}
              </p>
              <Button
                size="sm"
                variant="secondary"
                loading={checking}
                icon={<RefreshCw className="size-3.5" />}
                onClick={async () => {
                  setChecking(true);
                  await refresh();
                  setChecking(false);
                }}
              >
                Check again
              </Button>
            </div>

            {available ? (
              ai.enabled && ai.consentAt ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line/70 pt-4">
                  <p className="flex-1 text-sm text-muted">
                    AI generation is on since {new Date(ai.consentAt).toLocaleString()}. Campaign briefs are sent to {status?.provider} when you generate.
                  </p>
                  <Button size="sm" variant="danger" onClick={() => setAi({ enabled: false, consentAt: null })}>
                    Turn off AI
                  </Button>
                </div>
              ) : (
                <div className="mt-4 border-t border-line/70 pt-4">
                  <label className="flex gap-3 text-sm">
                    <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    <span>
                      I understand that when AI generation is on, my campaign brief and the selected concept (product name, description, benefits, audience, problem, price and
                      call to action) are sent through the AdSpark server to <strong>{status?.provider}</strong> and processed under that provider’s terms.
                    </span>
                  </label>
                  <Button className="mt-4" disabled={!consent} onClick={() => setAi({ enabled: true, consentAt: Date.now() })}>
                    Turn on AI generation
                  </Button>
                </div>
              )
            ) : null}
          </div>
          )}
        </Card>

        <Card as="section" className="scroll-mt-20 p-6">
          <div id="data" className="flex items-center gap-3">
            <Database className="size-5 text-secondary" aria-hidden />
            <h2 className="text-lg font-semibold">Backup and restore</h2>
          </div>
          <p className="mt-3 text-sm text-muted">
            {campaigns.length} campaign(s) and {brands.length} brand profile(s) are stored in this browser. Browser data can be cleared by the browser itself, so keep a backup of
            important work.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              icon={<Download className="size-4" />}
              onClick={() => {
                downloadText(JSON.stringify(createBackup(campaigns, brands), null, 2), `adspark-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
                toast('success', 'Backup downloaded.');
              }}
            >
              Download backup
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" id="restore-file" onChange={(e) => onRestore(e.target.files?.[0])} />
            <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
              Restore from file
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">Restoring adds the records from the file. Existing campaigns are not overwritten.</p>
        </Card>

        <Card as="section" className="scroll-mt-20 p-6">
          <div id="privacy" className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-success" aria-hidden />
            <h2 className="text-lg font-semibold">Privacy</h2>
          </div>
          <ul className="mt-4 grid gap-2.5 text-sm leading-relaxed text-muted">
            <li>• Campaigns, brand profiles and settings are stored only in this browser (IndexedDB). There is no account and no AdSpark cloud.</li>
            <li>• AdSpark has no analytics, tracking pixels or third-party scripts. Fonts are bundled with the app.</li>
            <li>• Nothing leaves your device unless you turn on AI generation above. Then only the campaign brief and selected concept are sent, through your own AdSpark server, to the provider shown.</li>
            <li>• Uploaded logos are checked for type and size (PNG, JPEG or WebP up to 500 KB) and never uploaded anywhere.</li>
            <li>• Exports (PDF, TXT, JSON) are created in your browser and saved directly to your device.</li>
          </ul>

          <div className="mt-6 rounded-xl border border-danger/30 bg-danger/5 p-4">
            <h3 className="font-semibold text-danger">Delete all data</h3>
            <p className="mt-1 text-sm text-muted">Permanently removes every campaign, brand profile and setting from this browser. This cannot be undone.</p>
            <Button className="mt-4" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirmClear(true)}>
              Delete all data
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmModal
        open={confirmClear}
        title="Delete all AdSpark data?"
        message={`This permanently deletes ${campaigns.length} campaign(s), ${brands.length} brand profile(s) and your settings from this browser. Download a backup first if you might need them.`}
        confirmLabel="Delete everything"
        onClose={() => setConfirmClear(false)}
        onConfirm={async () => {
          await clearAll();
          toast('success', 'All local data deleted.');
        }}
      />
    </>
  );
}
