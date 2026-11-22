import { Router, type IRouter } from 'express';
import healthRouter from './health';
import configRouter from './config';
import authRouter from './auth';
import generationsRouter from './generations';
import paymentRouter from './payment';
import adminRouter from './admin';
import mediaRouter from './media';
import adsRouter from './ads';

const router: IRouter = Router();

router.use(healthRouter);
router.use(configRouter);
router.use(authRouter);
router.use(generationsRouter);
router.use(paymentRouter);
router.use(adminRouter);
router.use(mediaRouter);
router.use(adsRouter);

export default router;
