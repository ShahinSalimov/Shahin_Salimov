import type { Metadata } from "next";
import { Logo } from "@/components/layout/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMessages } from "@/i18n/server";
import { requireUser } from "@/server/auth/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up" };

export default async function OnboardingPage() {
  await requireUser("/onboarding");
  const t = await getMessages();
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10">
      <Logo href="/app" />
      <Card className="mt-10 w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">{t.onboarding.title}</CardTitle>
          <CardDescription>{t.onboarding.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm t={t} />
        </CardContent>
      </Card>
    </div>
  );
}
