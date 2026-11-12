import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdScript Studio: AI video ad scripts for TikTok & Reels",
  description:
    "Turn any product into a scroll-stopping TikTok or Instagram Reels ad: hooks, second-by-second script, and ready-to-use AI image & video prompts in seconds.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "AdScript Studio: AI video ad scripts for TikTok & Reels",
    description: "Hooks, second-by-second script and AI image & video prompts for your product in 30 seconds.",
    type: "website",
  },
  twitter: { card: "summary" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/" className="text-lg font-bold tracking-tight">
            AdScript<span className="text-brand">Studio</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-muted">
            <Link href="/#pricing" className="hidden hover:text-white sm:inline">Pricing</Link>
            <Link href="/#faq" className="hidden hover:text-white sm:inline">FAQ</Link>
            <Link href="/dashboard" className="rounded-lg bg-white/10 px-4 py-2 text-white hover:bg-white/15">
              Open app
            </Link>
          </nav>
        </header>
        {children}
        <footer className="mx-auto mt-24 flex max-w-6xl flex-wrap gap-5 border-t border-line px-5 py-8 text-sm text-muted">
          <span>© {new Date().getFullYear()} AdScript Studio</span>
          <Link href="/terms" className="hover:text-white">Terms</Link>
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
        </footer>
      </body>
    </html>
  );
}
