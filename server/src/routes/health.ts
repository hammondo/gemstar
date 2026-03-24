import { Router } from 'express';

const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'skelly-api',
        timestamp: new Date().toISOString(),
    });
});

export default healthRouter;
