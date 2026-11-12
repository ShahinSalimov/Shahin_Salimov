import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getMessages } from "@/i18n/server";
import { getViewer } from "@/server/auth/session";
import { isDemoModeEnabled } from "@/server/env.server";

export default async function HomePage() {
  const viewer = await getViewer();
  if (viewer?.kind === "user") redirect("/app");
  const t = await getMessages();
  const demo = isDemoModeEnabled();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost">
            <Link href="/login">{t.common.signIn}</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 pb-24 sm:px-6">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Business change management</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">{t.common.tagline}</h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground text-pretty">
          Change a price, an address or opening hours once. CHANGEMESH shows every website page, PDF, spreadsheet and catalog that carries the
          same information, explains the impact, and routes the updates for approval.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/signup">{t.common.signUp}</Link>
          </Button>
          {demo ? (
            <form action="/demo" method="post">
              <Button type="submit" size="lg" variant="outline">
                {t.common.tryDemo}
              </Button>
            </form>
          ) : null}
        </div>
      </main>
    </div>
  );
}
