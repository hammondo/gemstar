// src/config.ts — Centralised config loading

import 'dotenv/config';
import { readFileSync } from 'fs';
import yaml from 'js-yaml';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { BrandVoiceConfig, ServiceConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

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
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    mockAnthropic: process.env.MOCK_ANTHROPIC === 'true',

    // Postiz
    postizApiUrl: process.env.POSTIZ_API_URL ?? 'http://localhost:3000',
    postizApiKey: process.env.POSTIZ_API_KEY ?? '',

    // Notifications
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    ownerEmail: process.env.OWNER_EMAIL ?? '',
    ownerPhone: process.env.OWNER_PHONE ?? '',

    // Dashboard
    dashboardPort: envInt('DASHBOARD_PORT', 5173),
    dashboardBaseUrl: process.env.DASHBOARD_BASE_URL ?? 'http://localhost:5173',
    dashboardSessionSecret: process.env.DASHBOARD_SESSION_SECRET ?? 'dev-secret',
    dashboardPassword: process.env.DASHBOARD_PASSWORD ?? 'bodyspace2025',

    // Microsoft authentication (Azure app registration)
    msClientId: process.env.MS_CLIENT_ID ?? '',
    msClientSecret: process.env.MS_CLIENT_SECRET ?? '',
    msTenantId: process.env.MS_TENANT_ID ?? 'common',
    msRedirectUri: process.env.MS_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback',

    // Agent schedules (cron, AWST)
    timezone: process.env.TIMEZONE ?? 'Australia/Perth',
    freshaWatcherCron: process.env.FRESHA_WATCHER_CRON ?? '0 8 * * *',
    monitorAgentCron: process.env.MONITOR_AGENT_CRON ?? '0 9 * * 1',
    campaignPlannerCron: process.env.CAMPAIGN_PLANNER_CRON ?? '0 10 * * 1',

    // Availability thresholds
    availabilityPushThreshold: envInt('AVAILABILITY_PUSH_THRESHOLD', 8),
    availabilityPauseThreshold: envInt('AVAILABILITY_PAUSE_THRESHOLD', 1),

    // Image generation (Replicate — FLUX Schnell)
    replicateApiToken: process.env.REPLICATE_API_TOKEN ?? '',
    mockImageGeneration: process.env.MOCK_IMAGE_GENERATION === 'true',

    // Base URL this API server is accessible at (used for image URLs sent to Postiz)
    apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',

    // Sanity CMS (website blog publishing)
    sanityProjectId: process.env.SANITY_PROJECT_ID ?? process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? '',
    sanityDataset: process.env.SANITY_DATASET ?? process.env.NEXT_PUBLIC_SANITY_DATASET ?? '',
    sanityApiVersion: process.env.SANITY_API_VERSION ?? '2024-05-01',
    sanityToken: process.env.SANITY_API_TOKEN ?? '',
    sanityBlogAuthor: process.env.SANITY_BLOG_AUTHOR ?? 'BodySpace Team',

    // Misc
    logLevel: process.env.LOG_LEVEL ?? 'info',
    nodeEnv: process.env.NODE_ENV ?? 'development',
    dataDir: resolve(ROOT, 'data'),
    configDir: resolve(ROOT, 'config'),
} as const;

// ─── YAML config loaders ──────────────────────────────────────────────────

function loadYaml<T>(filename: string): T {
    const path = resolve(ROOT, 'config', filename);
    return yaml.load(readFileSync(path, 'utf8')) as T;
}

let _brandVoice: BrandVoiceConfig | null = null;
export function getBrandVoice(): BrandVoiceConfig {
    if (!_brandVoice) _brandVoice = loadYaml<BrandVoiceConfig>('brand-voice.yaml');
    return _brandVoice;
}

let _services: ServiceConfig[] | null = null;
export function getAllServices(): ServiceConfig[] {
    if (_services) return _services;
    const raw = loadYaml<{
        services: Record<string, ServiceConfig[]>;
        signalRules: unknown;
    }>('services.yaml');
    _services = Object.values(raw.services).flat();
    return _services;
}

export function getServiceById(id: string): ServiceConfig | undefined {
    return getAllServices().find((s) => s.id === id);
}

let _competitors: unknown = null;
export function getCompetitors(): unknown {
    if (!_competitors) _competitors = loadYaml('competitors.yaml');
    return _competitors;
}
