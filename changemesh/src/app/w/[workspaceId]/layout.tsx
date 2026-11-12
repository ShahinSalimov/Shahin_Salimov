import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NotificationsMenu } from "@/components/shell/notifications-menu";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { UserMenu } from "@/components/shell/user-menu";
import { WorkspaceSwitcher } from "@/components/shell/workspace-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dashboardMetrics, isOpenChange } from "@/domain/insights/metrics";
import { getMessages } from "@/i18n/server";
import { logger } from "@/lib/logger";
import { listNotifications } from "@/server/commercial/service";
import { loadSnapshot } from "@/server/data";
import { listWorkspaces } from "@/server/workspaces/service";
import { loadWorkspace } from "@/server/workspaces/load";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await loadWorkspace(workspaceId);
  const [t, workspaces, snapshot, notifications] = await Promise.all([getMessages(), listWorkspaces(ctx.viewer), loadSnapshot(ctx), listNotifications(ctx).catch((error: unknown) => {
      // The bell must not take the whole workspace down; the failure is logged.
      logger.error("notifications.load_failed", { error });
      return [];
    })]);
  const isDemo = ctx.viewer.kind === "demo";
  const metrics = dashboardMetrics(snapshot);
  const counts = { changes: snapshot.changes.filter(isOpenChange).length, approvals: metrics.pendingApprovals };
  const current = { id: ctx.workspace.id, name: ctx.workspace.name, organizationName: ctx.workspace.organizationName };
  const switcherList = workspaces.map((w) => ({ id: w.id, name: w.name, organizationName: w.organizationName }));
  const user =
    ctx.viewer.kind === "user"
      ? { id: ctx.viewer.id, name: ctx.viewer.fullName, email: ctx.viewer.email }
      : { id: "demo-user-1", name: "Demo Visitor", email: "visitor@demo.changemesh.invalid" };

  return (
    <div className="min-h-dvh lg:pl-[252px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col gap-5 border-r border-sidebar-border bg-sidebar px-3 py-4 lg:flex">
        <div className="px-1.5">
          <Logo href={`/w/${ctx.workspace.id}`} />
        </div>
        <WorkspaceSwitcher current={current} workspaces={switcherList} labels={t.nav} isDemo={isDemo} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="mb-1.5 px-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t.nav.workspace}</p>
          <SidebarNav workspaceId={ctx.workspace.id} labels={t.nav} counts={counts} />
        </div>
        <div className="rounded-lg border bg-background/60 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t.workspace.yourRole}</span>
            <Badge variant="secondary">{t.roles[ctx.role]}</Badge>
          </div>
          {snapshot.subscription ? (
            <Link href={`/w/${ctx.workspace.id}/settings/billing`} className="mt-2 flex items-center justify-between hover:underline">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-medium capitalize">
                {snapshot.subscription.plan} · {snapshot.subscription.status}
              </span>
            </Link>
          ) : null}
        </div>
      </aside>

      {isDemo ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-warning/40 bg-warning/12 px-4 py-2 text-center text-[13px]">
          <span className="inline-flex items-center gap-2">
            <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
            {t.demo.banner}
          </span>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline" className="h-7 bg-background/70">
              <Link href="/signup">{t.demo.createAccount}</Link>
            </Button>
            <form action="/demo/exit" method="post">
              <Button size="sm" variant="ghost" type="submit" className="h-7">
                {t.common.exitDemo}
              </Button>
            </form>
          </div>
        </div>
      ) : null}

      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <MobileNav workspaceId={ctx.workspace.id} labels={t.nav} counts={counts} current={current} workspaces={switcherList} isDemo={isDemo} />
          <div className="min-w-0 lg:hidden">
            <p className="truncate text-sm font-semibold">{ctx.workspace.name}</p>
          </div>
          <div className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground lg:flex">
            <span className="truncate">{ctx.workspace.organizationName}</span>
            <span aria-hidden="true">/</span>
            <span className="truncate font-medium text-foreground">{ctx.workspace.name}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex lg:hidden">
              {t.roles[ctx.role]}
            </Badge>
            <NotificationsMenu workspaceId={ctx.workspace.id} items={notifications} />
            <UserMenu
              id={user.id}
              name={user.name}
              email={user.email}
              settingsHref={`/w/${ctx.workspace.id}/settings`}
              isDemo={isDemo}
              labels={t.nav}
              signOutLabel={isDemo ? t.common.exitDemo : t.common.signOut}
            />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
