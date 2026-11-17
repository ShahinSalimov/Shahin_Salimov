import { redirect } from "next/navigation";
import { getCreditPacks, getCreditsPerGeneration } from "@/lib/config";
import type { AdPack } from "@/lib/schema";
import { createUserClient } from "@/lib/supabase/server";
import Studio, { type HistoryItem } from "./studio";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createUserClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: profile }, { data: generations }] = await Promise.all([
    supabase.from("profiles").select("credits").eq("id", auth.user.id).maybeSingle(),
    supabase
      .from("generations")
      .select("id, input, output, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const history: HistoryItem[] = (generations ?? []).map((g) => ({
    id: g.id as string,
    productName: (g.input as { productName?: string })?.productName ?? "Untitled",
    createdAt: g.created_at as string,
    pack: g.output as AdPack,
  }));

  return (
    <Studio
      email={auth.user.email ?? ""}
      initialCredits={profile?.credits ?? 0}
      costPerGeneration={getCreditsPerGeneration()}
      packs={getCreditPacks().map(({ name, credits, price, url }) => ({ name, credits, price, url }))}
      history={history}
    />
  );
}
