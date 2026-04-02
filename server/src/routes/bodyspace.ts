// routes/bodyspace.ts — Assembles all /bodyspace sub-routers

import { Router } from 'express';
import agentsRouter from './agents.js';
import analyticsRouter from './analytics.js';
import campaignsRouter from './campaigns.js';
import libraryRouter from './library.js';
import settingsRouter from './settings.js';
import wizardRouter from './wizard.js';

const bodyspaceRouter = Router();

bodyspaceRouter.use(analyticsRouter);
bodyspaceRouter.use(campaignsRouter);
bodyspaceRouter.use(agentsRouter);
bodyspaceRouter.use(libraryRouter);
bodyspaceRouter.use(settingsRouter);
bodyspaceRouter.use(wizardRouter);

export default bodyspaceRouter;
