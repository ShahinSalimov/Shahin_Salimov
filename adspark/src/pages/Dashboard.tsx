import { Link } from 'react-router-dom';
import { ArrowRight, Clapperboard, Cpu, FolderOpen, Lightbulb, Palette, Sparkles, Film, Clock } from 'lucide-react';
import { useApp } from '../store/app';
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '../components/ui';
import type { Campaign } from '../lib/schemas';

export function campaignHref(c: Campaign) {
  return c.scenes.length ? `/app/campaigns/${c.id}` : `/app/campaigns/${c.id}/concepts`;
}

export function campaignStage(c: Campaign): { label: string; tone: 'success' | 'warning' | 'default' } {
  if (c.scenes.length) return { label: 'Full campaign', tone: 'success' };
  if (c.concepts.length) return { label: 'Choosing concept', tone: 'warning' };
  return { label: 'Draft', tone: 'default' };
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function Dashboard() {
  const campaigns = useApp((s) => s.campaigns);
  const brands = useApp((s) => s.brands);
  const ai = useApp((s) => s.ai);
  const status = useApp((s) => s.aiStatus);
  const recent = campaigns.slice(0, 5);
  const full = campaigns.filter((c) => c.scenes.length).length;
  const seconds = campaigns.reduce((a, c) => a + c.scenes.reduce((x, s) => x + s.duration, 0), 0);
  const usingAi = ai.enabled && ai.consentAt && status?.enabled;

  const stats = [
    { label: 'Campaigns', value: campaigns.length, icon: FolderOpen },
    { label: 'Full campaigns', value: full, icon: Film },
    { label: 'Concepts explored', value: campaigns.reduce((a, c) => a + c.concepts.length, 0), icon: Lightbulb },
    { label: 'Seconds scripted', value: seconds, icon: Clock },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Welcome to AdSpark"
        description="Plan concepts, scripts, storyboards and captions for your next ad campaign."
        actions={
          <ButtonLink to="/app/new" icon={<Sparkles className="size-4" />}>
            Create Campaign
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">{label}</span>
              <Icon className="size-4 text-muted" aria-hidden />
            </div>
            <p className="mt-3 font-display text-3xl font-bold">{value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-labelledby="recent-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recent-h" className="text-lg font-semibold">
              Recent campaigns
            </h2>
            {campaigns.length ? (
              <Link to="/app/campaigns" className="inline-flex items-center gap-1 text-sm text-secondary hover:underline">
                View all <ArrowRight className="size-3.5" />
              </Link>
            ) : null}
          </div>
          {recent.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="size-6" />}
              title="No campaigns yet"
              description="Describe a product and AdSpark will draft five advertising concepts for it."
              action={<ButtonLink to="/app/new">Create your first campaign</ButtonLink>}
            />
          ) : (
            <Card className="divide-y divide-line/70">
              {recent.map((c) => {
                const stage = campaignStage(c);
                return (
                  <Link key={c.id} to={campaignHref(c)} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02]">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-elevated font-display font-bold text-[#b9abff]">
                      {c.input.productName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted">
                        {c.input.platform} · {c.input.duration}s · {c.input.style} · {relativeTime(c.updatedAt)}
                      </p>
                    </div>
                    <Badge tone={stage.tone} className="hidden sm:inline-flex">
                      {stage.label}
                    </Badge>
                  </Link>
                );
              })}
            </Card>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Cpu className="size-4 text-secondary" aria-hidden />
              <h2 className="font-semibold">Generation engine</h2>
            </div>
            <p className="mt-2 text-sm text-muted">
              {usingAi
                ? `AI generation is on (${status?.provider}${status?.model ? `, ${status.model}` : ''}). Campaign details are sent to that provider when you generate.`
                : 'Using the local template engine. It works offline and does not send your data anywhere. It is not AI.'}
            </p>
            <Link to="/app/settings#ai" className="mt-3 inline-flex items-center gap-1 text-sm text-secondary hover:underline">
              Engine settings <ArrowRight className="size-3.5" />
            </Link>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">Quick actions</h2>
            <div className="mt-3 flex flex-col gap-2">
              <ButtonLink to="/app/new" variant="secondary" className="justify-start" icon={<Sparkles className="size-4" />}>
                New campaign
              </ButtonLink>
              <ButtonLink to="/app/storyboard" variant="secondary" className="justify-start" icon={<Clapperboard className="size-4" />}>
                Open Storyboard Studio
              </ButtonLink>
              <ButtonLink to="/app/brand" variant="secondary" className="justify-start" icon={<Palette className="size-4" />}>
                {brands.length ? `Brand Kit (${brands.length})` : 'Set up your Brand Kit'}
              </ButtonLink>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
