import { NextResponse } from "next/server";
import { generateAdPack, GenerationError } from "@/lib/claude";
import { getCreditsPerGeneration } from "@/lib/config";
import { readProductImage } from "@/lib/image";
import { GenerateInputSchema } from "@/lib/schema";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
// A generation usually takes 20-60 s. Raise if your host allows and you see timeouts.
export const maxDuration = 120;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const parsed = GenerateInputSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const imageResult = await readProductImage(form.get("image"));
  if (!imageResult.ok) return NextResponse.json({ error: imageResult.error }, { status: 400 });

  const cost = getCreditsPerGeneration();
  const admin = createAdminClient();

  const { data: balanceAfterSpend, error: spendError } = await admin.rpc("spend_credits", {
    p_user: user.id,
    p_amount: cost,
  });
  if (spendError) {
    console.error("spend_credits failed", spendError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (balanceAfterSpend === null) {
    return NextResponse.json({ error: "You're out of credits.", code: "NO_CREDITS" }, { status: 402 });
  }

  try {
    const pack = await generateAdPack(parsed.data, imageResult.image);
    const { data: row, error: insertError } = await admin
      .from("generations")
      .insert({
        user_id: user.id,
        input: { ...parsed.data, hasImage: Boolean(imageResult.image) },
        output: pack,
        credits_spent: cost,
      })
      .select("id")
      .single();
    if (insertError) console.error("saving generation failed", insertError);

    return NextResponse.json({ pack, credits: balanceAfterSpend, generationId: row?.id ?? null });
  } catch (error) {
    const { data: refunded } = await admin.rpc("refund_credits", { p_user: user.id, p_amount: cost });
    console.error("generation failed", error);
    const message = error instanceof GenerationError ? error.userMessage : "Generation failed. Please try again.";
    return NextResponse.json(
      { error: `${message} Your credit was not charged.`, credits: refunded ?? balanceAfterSpend + cost },
      { status: 502 },
    );
  }
}
