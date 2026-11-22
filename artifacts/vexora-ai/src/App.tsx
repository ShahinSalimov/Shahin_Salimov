import { AppStoreProvider, useApp } from '@/store/AppStore';
import { I18nProvider } from '@/i18n';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ProfilePage } from '@/components/layout/ProfilePage';
import { ExplorePage } from '@/components/explore/ExplorePage';
import { GeneratorPage } from '@/components/generator/GeneratorPage';
import { PricingPage } from '@/components/pricing/PricingPage';
import { CheckoutModal } from '@/components/pricing/CheckoutModal';
import { AuthModal } from '@/components/auth/AuthModal';
import { AdminPage } from '@/components/admin/AdminPage';
import { LegalPage } from '@/components/legal/LegalPage';

function Routes() {
  const { route } = useApp();
  switch (route) {
    case 'create': return <GeneratorPage />;
    case 'pricing': return <PricingPage />;
    case 'profile': return <ProfilePage />;
    case 'admin': return <AdminPage />;
    case 'terms': case 'privacy': case 'refunds': case 'contact': return <LegalPage doc={route} />;
    default: return <ExplorePage />;
  }
}

export default function App() {
  return (
    <I18nProvider>
      <AppStoreProvider>
        <Header />
        <main className="mx-auto max-w-7xl px-4 sm:px-6"><Routes /></main>
        <Footer />
        <CheckoutModal />
        <AuthModal />
      </AppStoreProvider>
    </I18nProvider>
  );
}
