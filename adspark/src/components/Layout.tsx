import { useEffect, useId, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Clapperboard, Cpu, FolderOpen, LayoutDashboard, Menu, Palette, Plus, Settings, Sparkles, X, CircleCheck, TriangleAlert, Info, LoaderCircle } from 'lucide-react';
import { useApp } from '../store/app';
import { ButtonLink, cx, IconButton } from './ui';

export function Logo({ className }: { className?: string }) {
  // Unique gradient id: several logos can be in the DOM at once (one may be hidden).
  const gradientId = `logo-gradient-${useId().replace(/:/g, '')}`;
  return (
    <span className={cx('inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight', className)}>
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8065F6" />
            <stop offset="1" stopColor="#36B8E8" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="#19243A" />
        <path d="M36 8 16 36h14l-4 20 22-30H34z" fill={`url(#${gradientId})`} />
      </svg>
      <span>
        Ad<span className="text-gradient">Spark</span>
      </span>
    </span>
  );
}

const NAV = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/new', label: 'New Campaign', icon: Plus, end: false },
  { to: '/app/campaigns', label: 'My Campaigns', icon: FolderOpen, end: false },
  { to: '/app/storyboard', label: 'Storyboard Studio', icon: Clapperboard, end: false },
  { to: '/app/brand', label: 'Brand Kit', icon: Palette, end: false },
  { to: '/app/settings', label: 'Settings', icon: Settings, end: false },
];

function EngineBadge() {
  const ai = useApp((s) => s.ai);
  const status = useApp((s) => s.aiStatus);
  const usingAi = ai.enabled && ai.consentAt && status?.enabled;
  return (
    <Link
      to="/app/settings#ai"
      className="flex items-center gap-2 rounded-xl border border-line bg-bg/50 px-3 py-2 text-xs text-muted transition-colors hover:border-primary/40 hover:text-ink"
    >
      <Cpu className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">
        Engine: <span className="font-medium text-ink">{usingAi ? `AI · ${status?.provider}` : 'Demo Generation'}</span>
      </span>
    </Link>
  );
}

function SaveIndicator() {
  const state = useApp((s) => s.saveState);
  if (state === 'idle') return null;
  return (
    <span className="hidden items-center gap-1.5 text-xs text-muted sm:inline-flex" role="status" aria-live="polite">
      {state === 'saving' ? <LoaderCircle className="size-3.5 animate-spin" /> : state === 'saved' ? <CircleCheck className="size-3.5 text-success" /> : <TriangleAlert className="size-3.5 text-danger" />}
      {state === 'saving' ? 'Saving…' : state === 'saved' ? 'All changes saved' : 'Save failed'}
    </span>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link to="/" className="px-2 pt-1" onClick={onNavigate} aria-label="AdSpark home">
        <Logo />
      </Link>
      <ButtonLink to="/app/new" onClick={onNavigate} icon={<Sparkles className="size-4" />} className="w-full">
        Create Campaign
      </ButtonLink>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-elevated text-ink shadow-[inset_2px_0_0_var(--color-primary)]' : 'text-muted hover:bg-white/[0.04] hover:text-ink',
              )
            }
          >
            <Icon className="size-4.5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <EngineBadge />
        <div className="flex gap-3 px-1 text-xs text-muted">
          <Link to="/pricing" className="hover:text-ink" onClick={onNavigate}>
            Pricing
          </Link>
          <Link to="/app/settings#privacy" className="hover:text-ink" onClick={onNavigate}>
            Privacy
          </Link>
        </div>
      </div>
    </div>
  );
}

export function Toaster() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={cx(
            'animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-elevated px-4 py-3 text-sm shadow-2xl',
            t.kind === 'error' ? 'border-danger/40' : t.kind === 'success' ? 'border-success/40' : 'border-line',
          )}
        >
          {t.kind === 'error' ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" /> : t.kind === 'success' ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" /> : <Info className="mt-0.5 size-4 shrink-0 text-secondary" />}
          <p className="flex-1 text-ink/90">{t.message}</p>
          <IconButton label="Dismiss notification" className="-my-1 -mr-2 size-7" onClick={() => dismiss(t.id)}>
            <X className="size-3.5" />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const loadError = useApp((s) => s.loadError);
  const skipped = useApp((s) => s.skippedRecords);

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="no-print sticky top-0 hidden h-dvh border-r border-line/70 bg-surface/60 lg:block">
        <Sidebar />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="animate-slide-in-left absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-surface">
            <IconButton label="Close navigation" className="absolute right-3 top-4" onClick={() => setOpen(false)}>
              <X className="size-5" />
            </IconButton>
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="min-w-0">
        <div className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line/70 bg-bg/80 px-4 backdrop-blur md:px-8">
          <IconButton label="Open navigation" className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </IconButton>
          <Link to="/app" className="lg:hidden" aria-label="AdSpark overview">
            <Logo className="text-base" />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <SaveIndicator />
            <ButtonLink to="/app/new" size="sm" icon={<Plus className="size-3.5" />} className="lg:hidden">
              New
            </ButtonLink>
          </div>
        </div>
        <main id="main" tabIndex={-1} className="mx-auto w-full outline-none max-w-7xl px-4 py-8 md:px-8">
          {loadError ? (
            <div role="alert" className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              Local storage is unavailable: {loadError} Campaigns cannot be saved in this browser session (private browsing can cause this).
            </div>
          ) : null}
          {skipped > 0 ? (
            <div role="status" className="mb-6 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
              {skipped} stored record(s) were damaged or from an incompatible version and were skipped. Your other data loaded normally.
            </div>
          ) : null}
          <div key={location.pathname} className="animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
