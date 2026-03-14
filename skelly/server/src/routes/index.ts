import { Router } from "express";
import healthRouter from "./health.js";
import sampleRouter from "./sample.js";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/sample", sampleRouter);

export default apiRouter;
