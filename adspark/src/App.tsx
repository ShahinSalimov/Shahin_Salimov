import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { STANDALONE } from './lib/edition';
import { AppLayout, Toaster } from './components/Layout';
import { Spinner } from './components/ui';
import { useApp } from './store/app';
import Landing from './pages/Landing';

const Pricing = lazy(() => import('./pages/Pricing'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const NewCampaign = lazy(() => import('./pages/NewCampaign'));
const ConceptsPage = lazy(() => import('./pages/ConceptsPage'));
const CampaignEditor = lazy(() => import('./pages/CampaignEditor'));
const StoryboardStudio = lazy(() => import('./pages/StoryboardStudio'));
const StoryboardPicker = lazy(() => import('./pages/StoryboardPicker'));
const VoiceoverStudio = lazy(() => import('./pages/VoiceoverStudio'));
const SocialContentPage = lazy(() => import('./pages/SocialContentPage'));
const Campaigns = lazy(() => import('./pages/Campaigns'));
const BrandKit = lazy(() => import('./pages/BrandKit'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PrintView = lazy(() => import('./pages/PrintView'));
const NotFound = lazy(() => import('./pages/NotFound'));

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Home'],
  [/^\/pricing$/, 'Pricing'],
  [/^\/app$/, 'Overview'],
  [/^\/app\/new$/, 'New campaign'],
  [/^\/app\/campaigns$/, 'My campaigns'],
  [/\/concepts$/, 'Campaign generator'],
  [/\/storyboard$/, 'Storyboard Studio'],
  [/\/voiceover$/, 'Voiceover Studio'],
  [/\/social$/, 'Social media content'],
  [/\/print$/, 'Print view'],
  [/^\/app\/campaigns\/[^/]+$/, 'Campaign editor'],
  [/^\/app\/brand$/, 'Brand Kit'],
  [/^\/app\/settings$/, 'Settings'],
];

/**
 * On client-side navigation: updates the document title, announces the new page to screen readers
 * and resets keyboard focus to the top so the next Tab reaches the skip link.
 */
function RouteFocus() {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const [label, setLabel] = useState('');
  useEffect(() => {
    const name = TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'Page not found';
    document.title = name === 'Home' ? 'AdSpark — Turn Any Product Into a Powerful Ad Campaign' : `${name} · AdSpark`;
    if (first.current) {
      first.current = false;
      return;
    }
    setLabel(`${name} page`);
    ref.current?.focus({ preventScroll: true });
  }, [pathname]);
  return (
    <div ref={ref} tabIndex={-1} className="sr-only" aria-live="polite">
      {label}
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const ready = useApp((s) => s.ready);
  if (!ready) return <div className="py-20"><Spinner label="Opening your workspace" /></div>;
  return <>{children}</>;
}

export default function App() {
  const init = useApp((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);

  return (
    <>
      <RouteFocus />
      <ScrollToTop />
      <Suspense fallback={<div className="flex justify-center py-20"><Spinner /></div>}>
        <Routes>
          {/* The standalone edition is for buyers: open straight into the app, no sales pages. */}
          <Route path="/" element={STANDALONE ? <Navigate to="/app" replace /> : <Landing />} />
          <Route path="/pricing" element={STANDALONE ? <Navigate to="/app" replace /> : <Pricing />} />
          <Route path="/app/campaigns/:id/print" element={<Gate><PrintView /></Gate>} />
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Gate><Dashboard /></Gate>} />
            <Route path="new" element={<Gate><NewCampaign /></Gate>} />
            <Route path="campaigns" element={<Gate><Campaigns /></Gate>} />
            <Route path="campaigns/:id" element={<Gate><CampaignEditor /></Gate>} />
            <Route path="campaigns/:id/concepts" element={<Gate><ConceptsPage /></Gate>} />
            <Route path="campaigns/:id/storyboard" element={<Gate><StoryboardStudio /></Gate>} />
            <Route path="campaigns/:id/voiceover" element={<Gate><VoiceoverStudio /></Gate>} />
            <Route path="campaigns/:id/social" element={<Gate><SocialContentPage /></Gate>} />
            <Route path="storyboard" element={<Gate><StoryboardPicker /></Gate>} />
            <Route path="brand" element={<Gate><BrandKit /></Gate>} />
            <Route path="settings" element={<Gate><SettingsPage /></Gate>} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="*" element={<NotFound standalone />} />
        </Routes>
      </Suspense>
      <Toaster />
    </>
  );
}
