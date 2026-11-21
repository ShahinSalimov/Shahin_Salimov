import { AppStoreProvider, useApp } from '@/store/AppStore';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ProfilePage } from '@/components/layout/ProfilePage';
import { ExplorePage } from '@/components/explore/ExplorePage';
import { GeneratorPage } from '@/components/generator/GeneratorPage';
import { PricingPage } from '@/components/pricing/PricingPage';
import { CheckoutModal } from '@/components/pricing/CheckoutModal';

function Routes() {
  const { route } = useApp();
  switch (route) {
    case 'create': return <GeneratorPage />;
    case 'pricing': return <PricingPage />;
    case 'profile': return <ProfilePage />;
    default: return <ExplorePage />;
  }
}

export default function App() {
  return (
    <AppStoreProvider>
      <Header />
      <main className="mx-auto max-w-7xl px-4 sm:px-6"><Routes /></main>
      <Footer />
      <CheckoutModal />
    </AppStoreProvider>
  );
}
