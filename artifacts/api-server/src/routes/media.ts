import { Router, type IRouter } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db, mediaTable } from '@workspace/db';
import type { UploadResult } from '@workspace/vexora-core';
import { requireUser } from '../lib/auth';
import { HttpError } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { parse } from '../lib/validate';
import { KEY_RE, MIME_BY_EXT, mediaUrl, openMedia, putMedia } from '../services/storage';

const router: IRouter = Router();
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

/** Checks real file signatures, not just the declared type. */
function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

/** Reference image for a generation (product, logo, face). Body: { dataUrl: "data:image/png;base64,…" } */
router.post('/uploads', requireUser, rateLimit({ key: 'upload', windowMs: 60_000, max: 20 }), async (req, res) => {
  const { dataUrl } = parse(z.object({ dataUrl: z.string().max(8_000_000) }), req.body);
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new HttpError(400, 'invalid_input');
  const buf = Buffer.from(m[2], 'base64');
  const mime = sniff(buf);
  if (!mime || !ALLOWED.includes(mime) || buf.length > MAX_BYTES) throw new HttpError(400, 'invalid_input');
  const key = await putMedia(buf, mime, 'upload', req.user!.id);
  const body: UploadResult = { key, url: mediaUrl(key) };
  res.status(201).json(body);
});

/** Serves stored media. Keys are random and unguessable; AI vendors fetch inputs from here. */
router.get('/media/:key', async (req, res) => {
  const { key } = parse(z.object({ key: z.string().regex(KEY_RE) }), req.params);
  const [row] = await db.select().from(mediaTable).where(eq(mediaTable.key, key));
  if (!row) throw new HttpError(404, 'not_found');
  res.setHeader('Content-Type', row.mime ?? MIME_BY_EXT[key.split('.').pop()!]);
  res.setHeader('Content-Length', String(row.size));
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const stream = openMedia(key);
  stream.on('error', () => { if (!res.headersSent) res.status(404).end(); else res.end(); });
  stream.pipe(res);
});

export default router;
