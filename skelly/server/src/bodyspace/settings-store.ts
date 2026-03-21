/**
 * Persistent settings stored as JSON files in the data directory.
 * These are user-editable configuration values that don't belong in env vars.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { settings } from './config.js';

// ── Monitor search terms ───────────────────────────────────────────────────

export const DEFAULT_MONITOR_TERMS: string[] = [
    '"wellness studio Cockburn Perth" OR "massage infrared sauna southern Perth" — summarise any competitor promos or new services',
    '"infrared sauna lymphatic drainage wellness trends Perth Australia 2026" — identify rising trends relevant to BodySpace',
    '"Perth wellness FIFO lifestyle" — capture seasonal and lifestyle context for this month',
];

function monitorTermsPath(): string {
    return resolve(settings.dataDir, 'monitor-search-terms.json');
}

export function getMonitorSearchTerms(): string[] {
    const path = monitorTermsPath();
    if (!existsSync(path)) return DEFAULT_MONITOR_TERMS;
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
        if (Array.isArray(parsed) && parsed.every((t) => typeof t === 'string')) {
            return parsed as string[];
        }
    } catch {
        // fall through
    }
    return DEFAULT_MONITOR_TERMS;
}

export function saveMonitorSearchTerms(terms: string[]): string[] {
    mkdirSync(settings.dataDir, { recursive: true });
    writeFileSync(monitorTermsPath(), JSON.stringify(terms, null, 2), 'utf8');
    return terms;
}
