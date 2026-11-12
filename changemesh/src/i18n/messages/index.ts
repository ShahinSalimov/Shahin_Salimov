import type { Locale } from "../config";
import { az } from "./az";
import { en, type Messages } from "./en";
import { tr } from "./tr";

export const MESSAGES: Record<Locale, Messages> = { en, az, tr };
export type { Messages };
