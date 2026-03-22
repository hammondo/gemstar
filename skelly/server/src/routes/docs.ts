import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiSpec } from '../openapi.js';

const docsRouter = Router();

// Build spec once at startup
const spec = buildOpenApiSpec();

docsRouter.get('/openapi.json', (_req, res) => {
    res.json(spec);
});

docsRouter.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

export default docsRouter;
