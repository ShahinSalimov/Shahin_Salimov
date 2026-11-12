import { NextResponse } from "next/server";
import * as z from "zod";
import { getCreditPacks } from "@/lib/config";
import { verifyLicense } from "@/lib/gumroad";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BodySchema = z.object({ licenseKey: z.string().min(1).max(100) });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Enter your license key." }, { status: 400 });

  const check = await verifyLicense(body.data.licenseKey, getCreditPacks());
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  const { data: credits, error } = await createAdminClient().rpc("redeem_license", {
    p_user: user.id,
    p_license_key: check.licenseKey,
    p_product_id: check.pack.productId,
    p_sale_id: check.saleId,
    p_credits: check.credits,
  });
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This license key has already been redeemed." }, { status: 409 });
    }
    console.error("redeem_license failed", error);
    return NextResponse.json({ error: "Could not add credits. Please contact support." }, { status: 500 });
  }

  return NextResponse.json({ credits, added: check.credits, pack: check.pack.name });
}
