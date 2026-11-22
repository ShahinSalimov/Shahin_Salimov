import { Router, type IRouter } from 'express';
import { z } from 'zod/v4';
import { eq } from 'drizzle-orm';
import { db, usersTable } from '@workspace/db';
import { endSession, hashPassword, startSession, syncAdminRole, verifyPassword } from '../lib/auth';
import { addEntry, balancesOf } from '../lib/ledger';
import { toMe } from '../lib/dto';
import { env } from '../lib/env';
import { HttpError } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';

const router: IRouter = Router();
const authLimit = rateLimit({ key: 'auth', windowMs: 15 * 60_000, max: 20 });

const Email = z.string().trim().toLowerCase().max(254);
const RegisterBody = z.object({ email: Email, password: z.string().max(200), name: z.string().trim().max(80).optional() });
const LoginBody = z.object({ email: Email, password: z.string().max(200) });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// A dummy hash so unknown emails take as long as wrong passwords (no user enumeration by timing).
const DUMMY = hashPassword('timing-equaliser');

router.post('/auth/register', authLimit, async (req, res) => {
  if (!env.signupEnabled) throw new HttpError(403, 'signup_disabled');
  const r = RegisterBody.safeParse(req.body);
  if (!r.success) throw new HttpError(400, 'invalid_input');
  const { email, password } = r.data;
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'invalid_email');
  if (password.length < 8) throw new HttpError(400, 'weak_password');
  const name = r.data.name || email.split('@')[0];
  const passwordHash = await hashPassword(password);

  const user = await db.transaction(async (tx) => {
    const [u] = await tx.insert(usersTable).values({ email, name, passwordHash }).onConflictDoNothing().returning();
    if (!u) throw new HttpError(409, 'email_taken');
    // Free bucket: usable only on low-cost models, so sign-up bonuses can never be spent on expensive video.
    await addEntry(tx, u.id, env.signupCredits, 'signup_bonus', undefined, undefined, 'free');
    return u;
  });
  const synced = await syncAdminRole(user);
  await startSession(res, synced.id);
  res.status(201).json({ user: toMe(synced, await balancesOf(db, synced.id)) });
});

router.post('/auth/login', authLimit, async (req, res) => {
  const r = LoginBody.safeParse(req.body);
  if (!r.success) throw new HttpError(400, 'invalid_input');
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, r.data.email)).limit(1);
  const ok = user ? await verifyPassword(r.data.password, user.passwordHash) : (await verifyPassword(r.data.password, await DUMMY), false);
  if (!user || !ok) throw new HttpError(401, 'invalid_credentials');
  const synced = await syncAdminRole(user);
  await startSession(res, synced.id);
  res.json({ user: toMe(synced, await balancesOf(db, synced.id)) });
});

router.post('/auth/logout', async (req, res) => {
  await endSession(res, req.sessionId);
  res.json({ ok: true });
});

/** Always 200 so signed-out visitors don't produce console errors. */
router.get('/auth/me', async (req, res) => {
  res.json({ user: req.user ? toMe(req.user, await balancesOf(db, req.user.id)) : null });
});

export default router;
