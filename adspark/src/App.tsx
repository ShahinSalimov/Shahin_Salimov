import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
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
      <ScrollToTop />
      <Suspense fallback={<div className="flex justify-center py-20"><Spinner /></div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/pricing" element={<Pricing />} />
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
