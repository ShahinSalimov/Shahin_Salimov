import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

export default function WorkspaceNotFound() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="Not found"
      description="This record does not exist, was deleted, or belongs to a workspace you cannot access."
      action={
        <Button asChild variant="outline">
          <Link href="/app">Back to your workspace</Link>
        </Button>
      }
    />
  );
}
