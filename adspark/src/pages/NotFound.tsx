import { Compass } from 'lucide-react';
import { ButtonLink, EmptyState } from '../components/ui';

export default function NotFound({ standalone }: { standalone?: boolean }) {
  const content = (
    <EmptyState
      icon={<Compass className="size-6" />}
      title="Page not found"
      description="The page you are looking for does not exist or the campaign was deleted."
      action={<ButtonLink to="/app">Go to overview</ButtonLink>}
    />
  );
  return standalone ? <main className="mx-auto max-w-xl px-4 py-24">{content}</main> : content;
}
