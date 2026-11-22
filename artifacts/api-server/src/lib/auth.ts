import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { CookieOptions, RequestHandler, Response } from 'express';
import { and, eq, gt } from 'drizzle-orm';
import { db, sessionsTable, usersTable, type UserRow } from '@workspace/db';
import { env } from './env';
import { HttpError } from './http';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: UserRow; sessionId?: string }
  }
}

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1 };
export const COOKIE = 'vx_session';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const cookieOpts = (): CookieOptions => ({
  httpOnly: true, sameSite: 'lax', secure: env.isProd, path: '/', maxAge: env.sessionDays * 864e5,
});

export async function startSession(res: Response, userId: string) {
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessionsTable).values({ id: sha256(token), userId, expiresAt: new Date(Date.now() + env.sessionDays * 864e5) });
  res.cookie(COOKIE, token, cookieOpts());
}

export async function endSession(res: Response, sessionId?: string) {
  if (sessionId) await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
  res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined });
}

/** Attaches req.user when a valid session cookie is present. Never rejects. */
export const loadUser: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[COOKIE];
  if (typeof token === 'string' && token.length > 20) {
    const id = sha256(token);
    const [row] = await db.select({ user: usersTable }).from(sessionsTable)
      .innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
      .where(and(eq(sessionsTable.id, id), gt(sessionsTable.expiresAt, new Date()))).limit(1);
    if (row) { req.user = row.user; req.sessionId = id; }
  }
  next();
};

export const requireUser: RequestHandler = (req, _res, next) => next(req.user ? undefined : new HttpError(401, 'unauthorized'));
export const requireAdmin: RequestHandler = (req, _res, next) =>
  next(!req.user ? new HttpError(401, 'unauthorized') : req.user.role !== 'admin' ? new HttpError(403, 'forbidden') : undefined);

/** Promote configured owner emails to admin. */
export async function syncAdminRole(user: UserRow): Promise<UserRow> {
  if (user.role !== 'admin' && env.adminEmails.includes(user.email)) {
    const [u] = await db.update(usersTable).set({ role: 'admin' }).where(eq(usersTable.id, user.id)).returning();
    return u;
  }
  return user;
}
