import { Router } from 'express';
import bodyspaceRouter from './bodyspace.js';
import healthRouter from './health.js';

const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/bodyspace', bodyspaceRouter);

export default apiRouter;
