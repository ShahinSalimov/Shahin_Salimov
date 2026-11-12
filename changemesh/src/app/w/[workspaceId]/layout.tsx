import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMessages } from "@/i18n/server";
import { loadWorkspace } from "@/server/workspaces/load";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await loadWorkspace(workspaceId);
  const t = await getMessages();
  const isDemo = ctx.viewer.kind === "demo";

  return (
    <div className="flex min-h-dvh flex-col">
      {isDemo ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-warning/40 bg-warning/15 px-4 py-2 text-center text-sm">
          <span className="inline-flex items-center gap-2">
            <FlaskConical className="size-4" aria-hidden="true" />
            {t.demo.banner}
          </span>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/signup">{t.demo.createAccount}</Link>
            </Button>
            <form action="/demo/exit" method="post">
              <Button size="sm" variant="ghost" type="submit">
                {t.common.exitDemo}
              </Button>
            </form>
          </div>
        </div>
      ) : null}
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Logo href={`/w/${ctx.workspace.id}`} />
            <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-xs text-muted-foreground">{ctx.workspace.organizationName}</p>
              <p className="truncate text-sm font-medium">{ctx.workspace.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{t.roles[ctx.role]}</Badge>
            <ThemeToggle />
            {isDemo ? null : (
              <form action="/auth/signout" method="post">
                <Button type="submit" variant="ghost" size="sm">
                  {t.common.signOut}
                </Button>
              </form>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
