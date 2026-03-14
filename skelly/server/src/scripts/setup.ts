import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const dirs = [
  "data/campaigns",
  "data/pending-review",
  "data/approved",
  "data/published",
  "data/trends",
  "data/fresha-exports",
  "logs",
];

for (const dir of dirs) {
  mkdirSync(resolve(ROOT, dir), { recursive: true });
  console.log(`Created ${dir}`);
}

const { getDb } = await import("../bodyspace/db.js");
getDb();

console.log("BodySpace server setup complete");
