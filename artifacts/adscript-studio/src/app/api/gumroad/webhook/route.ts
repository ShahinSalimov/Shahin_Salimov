import { NextResponse } from "next/server";
import { handleRefundNotification, isValidWebhookToken, type Redemption } from "@/lib/refunds";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Gumroad resource-subscription endpoint for "refund" and "dispute" events.
 * Register it as: https://YOUR-DOMAIN/api/gumroad/webhook?token=GUMROAD_WEBHOOK_TOKEN
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!isValidWebhookToken(token, process.env.GUMROAD_WEBHOOK_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = new URLSearchParams(await request.text());
  const admin = createAdminClient();

  const outcome = await handleRefundNotification(payload, {
    findRedemption: async ({ licenseKey, saleId }) => {
      const query = admin.from("redemptions").select("license_key, product_id").limit(1);
      const { data } = licenseKey
        ? await query.eq("license_key", licenseKey).maybeSingle()
        : await query.eq("sale_id", saleId!).maybeSingle();
      return (data as Redemption | null) ?? null;
    },
    revoke: async (licenseKey) => {
      const { data, error } = await admin.rpc("revoke_redemption", { p_license_key: licenseKey });
      if (error) throw error;
      return data as number | null;
    },
  });

  console.info("gumroad webhook", outcome);
  if (outcome.result === "retry") return NextResponse.json(outcome, { status: 503 });
  return NextResponse.json(outcome);
}
