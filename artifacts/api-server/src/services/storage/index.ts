import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { db, mediaTable } from '@workspace/db';

/**
 * Local-disk media storage (uploaded reference images, finished videos, extracted frames).
 * Files are served at /api/media/<key>; keys are long random strings, so links are unguessable.
 * On hosts with an ephemeral disk, point MEDIA_DIR at a persistent volume (or swap this module
 * for S3/R2 with the same put/open/url functions).
 */
const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR ?? './data/media');
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '');

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4' };
export const MIME_BY_EXT: Record<string, string> = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));

export const mediaPath = (key: string) => path.join(MEDIA_DIR, key);
/** Absolute URL when PUBLIC_BASE_URL is set (needed by AI vendors that fetch inputs), else site-relative. */
export const mediaUrl = (key: string) => `${PUBLIC_BASE_URL}/api/media/${key}`;

export async function putMedia(data: Buffer, mime: string, kind: 'upload' | 'output' | 'frame', userId: string | null): Promise<string> {
  const ext = EXT[mime];
  if (!ext) throw new Error(`unsupported mime ${mime}`);
  await mkdir(MEDIA_DIR, { recursive: true });
  const key = `${randomBytes(18).toString('base64url')}.${ext}`;
  await writeFile(mediaPath(key), data);
  await db.insert(mediaTable).values({ key, userId, kind, mime, size: data.length });
  return key;
}

/** Registers a file that was written directly into MEDIA_DIR (e.g. by ffmpeg). */
export async function registerMedia(key: string, mime: string, kind: 'output' | 'frame', userId: string | null) {
  const { size } = await stat(mediaPath(key));
  await db.insert(mediaTable).values({ key, userId, kind, mime, size });
}

export const newKey = (ext: string) => `${randomBytes(18).toString('base64url')}.${ext}`;
export const openMedia = (key: string) => createReadStream(mediaPath(key));
export const ensureMediaDir = () => mkdir(MEDIA_DIR, { recursive: true });
export const KEY_RE = /^[A-Za-z0-9_-]{20,40}\.(png|jpg|webp|mp4)$/;
