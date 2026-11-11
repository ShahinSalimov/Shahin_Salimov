import { bytesToBase64 } from './base64';
export const MAX_LOGO_BYTES = 500 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'] as const;

export class FileValidationError extends Error {}

/** Detects the real image type from magic bytes so a renamed file cannot pass as an image. */
export function sniffImageType(bytes: Uint8Array): (typeof ALLOWED)[number] | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF' &&
    String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === 'WEBP'
  )
    return 'image/webp';
  return null;
}


/** Validates an uploaded logo (type, size, real content) and returns a safe data URL. SVG is rejected because it can carry scripts. */
export async function readLogo(file: File): Promise<string> {
  if (file.size > MAX_LOGO_BYTES) throw new FileValidationError('The logo must be 500 KB or smaller.');
  if (!(ALLOWED as readonly string[]).includes(file.type)) throw new FileValidationError('Use a PNG, JPEG or WebP image. SVG files are not accepted.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const real = sniffImageType(bytes);
  if (!real) throw new FileValidationError('This file is not a valid PNG, JPEG or WebP image.');
  return `data:${real};base64,${bytesToBase64(bytes)}`;
}
