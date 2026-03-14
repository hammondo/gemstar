// src/config.ts — Centralised config loading

import "dotenv/config";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import type { BrandVoiceConfig, ServiceConfig } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (val === undefined) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function envInt(key: string, fallback: number): number {
  return parseInt(process.env[key] ?? String(fallback), 10);
}

// ─── Settings object ──────────────────────────────────────────────────────

export const settings = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  mockAnthropic: process.env.MOCK_ANTHROPIC === "true",

  // Fresha
  freshaDb: {
    host: process.env.FRESHA_DB_HOST ?? "",
    port: envInt("FRESHA_DB_PORT", 5432),
    name: process.env.FRESHA_DB_NAME ?? "",
    user: process.env.FRESHA_DB_USER ?? "",
    password: process.env.FRESHA_DB_PASSWORD ?? "",
  },
  freshaGsheetsId: process.env.FRESHA_GSHEETS_ID ?? "",
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "",

  // Postiz
  postizApiUrl: process.env.POSTIZ_API_URL ?? "http://localhost:3000",
  postizApiKey: process.env.POSTIZ_API_KEY ?? "",

  // Notifications
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  ownerEmail: process.env.OWNER_EMAIL ?? "",
  ownerPhone: process.env.OWNER_PHONE ?? "",

  // Dashboard
  dashboardPort: envInt("DASHBOARD_PORT", 5173),
  dashboardBaseUrl: process.env.DASHBOARD_BASE_URL ?? "http://localhost:5173",
  dashboardSessionSecret: process.env.DASHBOARD_SESSION_SECRET ?? "dev-secret",
  dashboardPassword: process.env.DASHBOARD_PASSWORD ?? "bodyspace2025",

  // Agent schedules (cron, AWST)
  timezone: process.env.TIMEZONE ?? "Australia/Perth",
  freshaWatcherCron: process.env.FRESHA_WATCHER_CRON ?? "0 8 * * *",
  monitorAgentCron: process.env.MONITOR_AGENT_CRON ?? "0 9 * * 1",
  campaignPlannerCron: process.env.CAMPAIGN_PLANNER_CRON ?? "0 10 * * 1",

  // Availability thresholds
  availabilityPushThreshold: envInt("AVAILABILITY_PUSH_THRESHOLD", 8),
  availabilityPauseThreshold: envInt("AVAILABILITY_PAUSE_THRESHOLD", 1),

  // Misc
  logLevel: process.env.LOG_LEVEL ?? "info",
  nodeEnv: process.env.NODE_ENV ?? "development",
  dataDir: resolve(ROOT, "data"),
  configDir: resolve(ROOT, "config"),
} as const;

// ─── YAML config loaders ──────────────────────────────────────────────────

function loadYaml<T>(filename: string): T {
  const path = resolve(ROOT, "config", filename);
  return yaml.load(readFileSync(path, "utf8")) as T;
}

let _brandVoice: BrandVoiceConfig | null = null;
export function getBrandVoice(): BrandVoiceConfig {
  if (!_brandVoice)
    _brandVoice = loadYaml<BrandVoiceConfig>("brand-voice.yaml");
  return _brandVoice;
}

let _services: ServiceConfig[] | null = null;
export function getAllServices(): ServiceConfig[] {
  if (_services) return _services;
  const raw = loadYaml<{
    services: Record<string, ServiceConfig[]>;
    signalRules: unknown;
  }>("services.yaml");
  _services = Object.values(raw.services).flat();
  return _services;
}

export function getServiceById(id: string): ServiceConfig | undefined {
  return getAllServices().find((s) => s.id === id);
}

let _competitors: unknown = null;
export function getCompetitors(): unknown {
  if (!_competitors) _competitors = loadYaml("competitors.yaml");
  return _competitors;
}
