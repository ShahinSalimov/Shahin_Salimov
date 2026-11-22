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
import { SandboxAdHost } from '@/components/ads/SandboxAdHost';
import { AdminPage } from '@/components/admin/AdminPage';
import { LegalPage } from '@/components/legal/LegalPage';
import { PaymentSandboxPage } from '@/components/payment/PaymentSandboxPage';
import { PaymentResultPage } from '@/components/payment/PaymentResultPage';

function Routes() {
  const { route } = useApp();
  switch (route) {
    case 'create': return <GeneratorPage />;
    case 'pricing': return <PricingPage />;
    case 'profile': return <ProfilePage />;
    case 'admin': return <AdminPage />;
    case 'terms': case 'privacy': case 'refunds': case 'delivery': case 'contact': return <LegalPage key={route} doc={route} />;
    case 'payment-sandbox': return <PaymentSandboxPage />;
    case 'payment-success': return <PaymentResultPage key="ok" expected="success" />;
    case 'payment-failed': return <PaymentResultPage key="fail" expected="failed" />;
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
        <SandboxAdHost />
      </AppStoreProvider>
    </I18nProvider>
  );
}
