import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import authRouter from './auth.js';
import bodyspaceRouter from './bodyspace.js';
import docsRouter from './docs.js';
import healthRouter from './health.js';

const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/bodyspace', requireAuth, bodyspaceRouter);
apiRouter.use('/', docsRouter);

export default apiRouter;
