import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import apiRouter from "./routes/index.js";
import { startBodyspaceScheduler } from "./bodyspace/orchestrator.js";

dotenv.config();

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(express.json());
app.use(
  cors({
    origin: allowedOrigins,
  }),
);

app.use("/api", apiRouter);

app.get("/", (_req, res) => {
  res.json({ message: "Skelly API running", bodyspaceApi: "/api/bodyspace" });
});

app.listen(port, () => {
  console.log(`Skelly API listening on http://localhost:${port}`);
  // startBodyspaceScheduler();
});
