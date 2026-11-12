import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, Building2, CreditCard, Users } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { SectionCard } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";
import { adminOverview, requirePlatformAdmin } from "@/server/commercial/admin";

export const metadata: Metadata = { title: "Platform admin", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await requirePlatformAdmin();
  const data = await adminOverview();
  return (
    <div className="mx-auto grid w-full max-w-[1280px] gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo href="/app" />
          <Badge variant="warning">Platform admin</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Signed in as {admin.email} ·{" "}
          <Link href="/app" className="hover:underline">
            Back to app
          </Link>
        </p>
      </header>
      <p className="text-sm text-muted-foreground">Read-only, aggregate view across all tenants. Tenant content (assets, changes, documents) is not shown here.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Organizations" icon={Building2} value={data.totals.organizations} />
        <StatCard label="Users" icon={Users} value={data.totals.users} />
        <StatCard label="Active assets" icon={Boxes} value={data.totals.assets} />
        <StatCard label="Live subscriptions" icon={CreditCard} value={data.totals.activeSubscriptions} />
      </div>
      <SectionCard title="Organizations" description="Newest first (max 200)." bodyClassName="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Organization</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Workspaces</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead className="text-right">Assets</TableHead>
              <TableHead className="hidden md:table-cell">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.organizations.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">
                  {o.name} {o.isDemo ? <Badge variant="outline">demo</Badge> : null}
                </TableCell>
                <TableCell className="capitalize">{o.plan ? `${o.plan} · ${o.status}` : <span className="text-muted-foreground">none (Starter limits)</span>}</TableCell>
                <TableCell className="tabular text-right">{o.workspaces}</TableCell>
                <TableCell className="tabular text-right">{o.members}</TableCell>
                <TableCell className="tabular text-right">{o.assets}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(o.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
      <SectionCard title="Recent Stripe events" description="Processed webhook events (test mode).">
        {data.recentEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No webhook events received yet.</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {data.recentEvents.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2">
                <code className="text-xs">{e.type}</code>
                <span className="text-xs text-muted-foreground">{formatDateTime(e.receivedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
