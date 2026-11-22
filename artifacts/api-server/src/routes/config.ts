import { Router, type IRouter } from 'express';
import { CURRENCIES, type PublicConfig } from '@workspace/vexora-core';
import { env } from '../lib/env';

const router: IRouter = Router();

router.get('/config', (_req, res) => {
  const body: PublicConfig = {
    paymentsEnabled: env.paymentProvider !== 'none',
    paymentProvider: env.paymentProvider,
    signupEnabled: env.signupEnabled,
    signupCredits: env.signupCredits,
    currencies: [...CURRENCIES],
  };
  res.json(body);
});

export default router;
