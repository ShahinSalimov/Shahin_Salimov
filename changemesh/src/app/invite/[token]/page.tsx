import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { AcceptInvitationForm } from "@/components/forms/commercial-forms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";
import { getViewer } from "@/server/auth/session";
import { previewInvitation } from "@/server/commercial/service";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };
export const dynamic = "force-dynamic";

const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-md gap-6 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <Logo href="/" />
        {children}
      </div>
    </div>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const path = `/invite/${token}`;
  if (!isSupabaseConfigured() || !TOKEN.test(token)) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Invitation not valid</h1>
        <p className="text-sm text-muted-foreground">Check that you copied the complete link, or ask for a new invitation.</p>
      </Shell>
    );
  }
  const viewer = await getViewer();
  if (!viewer || viewer.kind !== "user") {
    return (
      <Shell>
        <div className="grid gap-1.5">
          <h1 className="text-xl font-semibold">You have been invited to CHANGEMESH</h1>
          <p className="text-sm text-muted-foreground">Sign in, or create an account with the email address the invitation was sent to. Then this page lets you join the workspace.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent(path)}`}>Sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/signup?next=${encodeURIComponent(path)}`}>Create account</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const preview = await previewInvitation(token);
  if (!preview) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Invitation not valid</h1>
        <p className="text-sm text-muted-foreground">This link does not match any invitation. Ask the workspace admin for a new one.</p>
      </Shell>
    );
  }
  const emailMatches = preview.email.toLowerCase() === viewer.email.toLowerCase();
  return (
    <Shell>
      <div className="grid gap-1.5">
        <h1 className="text-xl font-semibold">Join {preview.workspaceName}</h1>
        <p className="text-sm text-muted-foreground">
          {preview.organizationName} invited <span className="font-medium text-foreground">{preview.email}</span> as <span className="font-medium text-foreground capitalize">{preview.role}</span>.
        </p>
      </div>
      {preview.status !== "open" ? (
        <Alert variant="warning">
          <AlertDescription>
            This invitation {preview.status === "accepted" ? "was already used" : preview.status === "revoked" ? "was revoked" : "has expired"}. Ask the workspace admin for a new one.
          </AlertDescription>
        </Alert>
      ) : !emailMatches ? (
        <Alert variant="warning">
          <AlertDescription>
            You are signed in as {viewer.email}. This invitation is for {preview.email}. Sign out and sign in with that address to accept it.
          </AlertDescription>
        </Alert>
      ) : (
        <AcceptInvitationForm token={token} />
      )}
      <Link href="/app" className="text-center text-sm text-muted-foreground hover:underline">
        Go to my workspaces
      </Link>
    </Shell>
  );
}
