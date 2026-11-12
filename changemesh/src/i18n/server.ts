import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { isLocale, LOCALE_COOKIE, matchLocale, type Locale } from "./config";
import { MESSAGES, type Messages } from "./messages";

export const getLocale = cache(async (): Promise<Locale> => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  return matchLocale((await headers()).get("accept-language"));
});

export async function getMessages(): Promise<Messages> {
  return MESSAGES[await getLocale()];
}
