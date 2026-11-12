import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/domain/auth/schemas";
import { logger } from "@/lib/logger";
import { createUserClient } from "@/server/supabase/clients";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/** Handles OAuth (?code=) and email confirmation (?token_hash=&type=) links. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  try {
    const supabase = await createUserClient();
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
      logger.warn("auth.callback.code_failed", { code: error.code });
    } else if (tokenHash && type && OTP_TYPES.includes(type)) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
      logger.warn("auth.callback.otp_failed", { code: error.code });
    }
  } catch (error) {
    logger.error("auth.callback.error", { error });
  }
  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", url.origin));
}
