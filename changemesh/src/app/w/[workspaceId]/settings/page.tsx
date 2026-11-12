import type { Metadata } from "next";
import { PageHeader, SectionCard } from "@/components/app/page-header";
import { SettingsNav } from "@/components/app/settings-nav";
import { ProfileForm, RenameWorkspaceForm, ThemePicker } from "@/components/forms/settings-forms";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { can } from "@/domain/rbac/roles";
import { getLocale } from "@/i18n/server";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await loadWorkspace(workspaceId);
  const locale = await getLocale();
  const base = `/w/${ctx.workspace.id}`;

  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description={ctx.workspace.name} />
      <SettingsNav base={base} active="general" />
      <SectionCard title="Workspace" description="Visible to every member of this workspace.">
        <RenameWorkspaceForm workspaceId={ctx.workspace.id} name={ctx.workspace.name} disabled={!can(ctx.role, "workspace.update")} />
        <dl className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Organization</dt>
            <dd className="mt-0.5">{ctx.workspace.organizationName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Workspace ID</dt>
            <dd className="mt-0.5 font-mono text-xs break-all">{ctx.workspace.id}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Data region</dt>
            <dd className="mt-0.5">{ctx.viewer.kind === "demo" ? "Demo (in-memory)" : "Your Supabase project region"}</dd>
          </div>
        </dl>
      </SectionCard>
      {ctx.viewer.kind === "user" ? (
        <SectionCard title="Your profile" description={ctx.viewer.email}>
          <ProfileForm fullName={ctx.viewer.fullName ?? ""} locale={locale} />
        </SectionCard>
      ) : (
        <SectionCard title="Your profile">
          <p className="text-sm text-muted-foreground">Demo visitors do not have a profile. Create an account to save your name and language.</p>
        </SectionCard>
      )}
      <SectionCard title="Appearance" description="Saved in this browser.">
        <ThemePicker />
      </SectionCard>
      <SectionCard title="Interface language" description="Applies to this browser.">
        <LocaleSwitcher current={locale} />
        <p className="mt-3 text-xs text-muted-foreground">Navigation and account screens are translated. Workspace pages are currently English-only.</p>
      </SectionCard>
    </div>
  );
}
