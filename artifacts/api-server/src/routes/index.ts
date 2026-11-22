import { Router, type IRouter } from 'express';
import healthRouter from './health';
import configRouter from './config';
import authRouter from './auth';
import generationsRouter from './generations';
import paymentsRouter from './payments';
import adminRouter from './admin';

const router: IRouter = Router();

router.use(healthRouter);
router.use(configRouter);
router.use(authRouter);
router.use(generationsRouter);
router.use(paymentsRouter);
router.use(adminRouter);

export default router;
