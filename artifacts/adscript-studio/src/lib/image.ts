import type { ProductImage } from "./claude";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "./schema";

export type ImageResult = { ok: true; image: ProductImage | undefined } | { ok: false; error: string };

/** Validate an optional uploaded product photo and convert it to base64 for Claude. */
export async function readProductImage(value: FormDataEntryValue | null): Promise<ImageResult> {
  if (value === null || typeof value === "string" || value.size === 0) return { ok: true, image: undefined };
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(value.type)) {
    return { ok: false, error: "Image must be JPG, PNG, WEBP or GIF." };
  }
  if (value.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image must be 5 MB or smaller." };
  }
  const base64 = Buffer.from(await value.arrayBuffer()).toString("base64");
  return { ok: true, image: { mediaType: value.type as ProductImage["mediaType"], base64 } };
}
