import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Messages } from "@/i18n/messages";

export function AuthNotConfigured({ t, demo }: { t: Messages; demo: boolean }) {
  return (
    <div className="grid gap-4">
      <Alert variant="warning">
        <TriangleAlert />
        <AlertTitle>{t.auth.notConfiguredTitle}</AlertTitle>
        <AlertDescription>{t.auth.notConfiguredBody}</AlertDescription>
      </Alert>
      {demo ? (
        <form action="/demo" method="post">
          <Button type="submit" variant="outline" className="w-full">
            {t.common.tryDemo}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
