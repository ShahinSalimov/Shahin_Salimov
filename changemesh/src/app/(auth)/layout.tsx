import { BrandPanel } from "@/components/layout/brand-panel";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getLocale, getMessages } from "@/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-4 py-5 sm:px-8">
          <Logo />
          <ThemeToggle />
        </header>
        <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
          <div className="w-full max-w-sm">{children}</div>
        </main>
        <footer className="flex justify-center pb-6">
          <LocaleSwitcher current={locale} />
        </footer>
      </div>
      <BrandPanel tagline={t.common.tagline} />
    </div>
  );
}
