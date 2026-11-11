import { Link } from 'react-router-dom';
import { Clapperboard, ArrowRight } from 'lucide-react';
import { useApp } from '../store/app';
import { ButtonLink, Card, EmptyState, PageHeader } from '../components/ui';
import { StoryboardFrame } from '../components/StoryboardFrame';
import { totalDuration } from '../lib/scenes';

export default function StoryboardPicker() {
  const campaigns = useApp((s) => s.campaigns);
  const withScenes = campaigns.filter((c) => c.scenes.length);
  return (
    <>
      <PageHeader eyebrow="Storyboard Studio" title="Choose a storyboard" description="Open a campaign’s storyboard to edit, reorder and preview its scenes." />
      {withScenes.length === 0 ? (
        <EmptyState
          icon={<Clapperboard className="size-6" />}
          title="No storyboards yet"
          description="A storyboard is created when you pick a concept and create the full campaign."
          action={<ButtonLink to={campaigns.length ? '/app/campaigns' : '/app/new'}>{campaigns.length ? 'Open My Campaigns' : 'Create a campaign'}</ButtonLink>}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {withScenes.map((c) => (
            <Link key={c.id} to={`/app/campaigns/${c.id}/storyboard`} className="group">
              <Card className="overflow-hidden transition-colors group-hover:border-primary/50">
                <div className="grid grid-cols-3 gap-px bg-line/60">
                  {c.scenes.slice(0, 3).map((s, i) => (
                    <StoryboardFrame key={s.id} shot={s.shot} style={c.storyboardStyle} number={i + 1} className="block w-full" />
                  ))}
                </div>
                <div className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-muted">
                      {c.scenes.length} scenes · {totalDuration(c.scenes)}s · {c.storyboardStyle} style
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
