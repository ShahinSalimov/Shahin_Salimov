import { Router, type IRouter } from 'express';
import { CURRENCIES, type PublicConfig } from '@workspace/vexora-core';
import { env } from '../lib/env';
import { activeGateway, paymentConfig } from '../services/payment';

const router: IRouter = Router();

router.get('/config', (_req, res) => {
  const body: PublicConfig = {
    paymentsEnabled: !!activeGateway(),
    paymentMode: paymentConfig.mode,
    paymentGateway: paymentConfig.gateway,
    chargeCurrency: activeGateway()?.chargeCurrency ?? null,
    signupEnabled: env.signupEnabled,
    signupCredits: env.signupCredits,
    currencies: [...CURRENCIES],
  };
  res.json(body);
});

export default router;
