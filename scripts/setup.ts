// scripts/setup.ts
// First-run setup: initialise DB, verify config, create data directories.

import { mkdirSync, existsSync, copyFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

console.log("🌿 BodySpace Marketing Agent — Setup\n");

// 1. Copy .env if not exists
const envPath = resolve(ROOT, ".env");
const envExamplePath = resolve(ROOT, ".env.example");
if (!existsSync(envPath) && existsSync(envExamplePath)) {
  copyFileSync(envExamplePath, envPath);
  console.log("✅ Created .env from .env.example — add your API keys");
} else if (existsSync(envPath)) {
  console.log("✅ .env already exists");
} else {
  console.warn("⚠️  No .env.example found");
}

// 2. Create data directories
const dirs = [
  "data/campaigns",
  "data/pending-review",
  "data/approved",
  "data/published",
  "data/trends",
  "logs",
];

for (const dir of dirs) {
  const path = resolve(ROOT, dir);
  mkdirSync(path, { recursive: true });
  console.log(`✅ Created ${dir}/`);
}

// 3. Initialise database
import("dotenv/config").then(async () => {
  const { getDb } = await import("../src/db.js");
  const db = getDb();
  console.log("✅ Database initialised at data/bodyspace.db");

  // 4. Check required env vars
  const required = ["ANTHROPIC_API_KEY"];
  const optional = ["RESEND_API_KEY", "OWNER_EMAIL", "POSTIZ_API_KEY", "FRESHA_DB_HOST", "FRESHA_GSHEETS_ID"];

  console.log("\n📋 Environment check:");
  let allRequired = true;
  for (const key of required) {
    const val = process.env[key];
    if (!val || val.includes("your_")) {
      console.log(`  ❌ ${key} — REQUIRED, not set`);
      allRequired = false;
    } else {
      console.log(`  ✅ ${key} — set`);
    }
  }

  for (const key of optional) {
    const val = process.env[key];
    if (!val || val.includes("your_")) {
      console.log(`  ⚠️  ${key} — optional, not set`);
    } else {
      console.log(`  ✅ ${key} — set`);
    }
  }

  const freshaDb = process.env.FRESHA_DB_HOST;
  const freshaSheets = process.env.FRESHA_GSHEETS_ID;
  if (!freshaDb && !freshaSheets) {
    console.log("\n  ℹ️  No Fresha data source configured — will use mock data.");
    console.log("     Set FRESHA_DB_HOST (PostgreSQL) or FRESHA_GSHEETS_ID (Google Sheets).");
  }

  if (!allRequired) {
    console.log("\n⚠️  Add missing required vars to .env before running.");
  } else {
    console.log("\n✅ Setup complete! Run the agent:");
    console.log("   npm run dev          — Start the scheduler");
    console.log("   npm run start:dashboard  — Start the approval dashboard");
    console.log("   npm run agent:fresha — Test Fresha availability check");
    console.log("   npm run agent:monitor — Run competitor research");
    console.log(`   Open dashboard: http://localhost:${process.env.DASHBOARD_PORT ?? 3001}`);
  }

  db.close();
  process.exit(0);
});
