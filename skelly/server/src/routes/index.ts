import { Router } from "express";
import healthRouter from "./health.js";
import bodyspaceRouter from "./bodyspace.js";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/bodyspace", bodyspaceRouter);

export default apiRouter;
