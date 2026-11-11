import { Link } from 'react-router-dom';
import { ArrowRight, Clapperboard, Cpu, FolderOpen, Lightbulb, Palette, Sparkles, Film, Clock } from 'lucide-react';
import { useApp } from '../store/app';
import { ButtonLink, Card, EmptyState, PageHeader } from '../components/ui';
import { CampaignCard } from '../components/CampaignCard';

export default function Dashboard() {
  const campaigns = useApp((s) => s.campaigns);
  const brands = useApp((s) => s.brands);
  const ai = useApp((s) => s.ai);
  const status = useApp((s) => s.aiStatus);
  const recent = campaigns.slice(0, 4);
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
            <div className="grid gap-4 sm:grid-cols-2">
              {recent.map((c) => (
                <CampaignCard key={c.id} c={c} />
              ))}
            </div>
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
                : 'Demo Generation is active: a local template engine that fills proven ad structures with your brief. It works offline, sends nothing anywhere and is not AI.'}
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
