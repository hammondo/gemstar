// src/agents/fresha-watcher/agent.ts
//
// Derives booking availability signals from a Fresha appointments CSV export.
//
// HOW TO EXPORT FROM FRESHA (2 minutes, done weekly):
//   1. Fresha Dashboard → Sales → Appointments
//   2. Set date filter to the next 14 days
//   3. Status filter: Booked (exclude Cancelled, No-show, Completed)
//   4. Click Export → CSV
//   5. Drop the file into data/fresha-exports/  (or upload via the dashboard)
//
// The agent reads the latest CSV, counts confirmed future bookings per service,
// subtracts from each service's known weekly capacity → produces PUSH/HOLD/PAUSE signal.

import { mkdirSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolve } from 'path';
import { getAllServices, settings } from '../../config.js';
import { getLatestSignals, saveAvailabilitySignals } from '../../db.js';
import type { AvailabilitySignal, AvailabilitySignals } from '../../types.js';
// ─── Fresha CSV column name variations ───────────────────────────────────
const SERVICE_COL_ALIASES = ['Service', 'Service Name', 'Treatment', 'service', 'Service name'];
const DATE_COL_ALIASES = ['Date', 'Appointment Date', 'date', 'Appointment date'];
const STATUS_COL_ALIASES = ['Status', 'Appointment Status', 'status', 'Appointment status'];

// Statuses in the CSV that mean a slot is occupied
const BOOKED_STATUSES = ['booked', 'confirmed', 'pending', 'arrived', 'started', 'in progress'];

// ─── Fresha service name → internal service ID ────────────────────────────
// Keys are lowercase Fresha service names as they appear in the CSV export.
// Add variants if your Fresha service names differ.

const SERVICE_NAME_MAP: Record<string, string> = {
    'relaxation massage': 'relaxation_massage',
    'remedial massage': 'remedial_massage',
    'pregnancy massage': 'pregnancy_massage',
    'natural healing – reiki': 'reiki',
    'natural healing - reiki': 'reiki',
    reiki: 'reiki',
    'natural healing – chakra balance': 'chakra_balance',
    'natural healing - chakra balance': 'chakra_balance',
    'chakra balance': 'chakra_balance',
    'natural healing – aromatouch technique': 'aromatouch',
    'natural healing - aromatouch technique': 'aromatouch',
    'aromatouch technique': 'aromatouch',
    aromatouch: 'aromatouch',
    'natural healing – ayurvedic foot massage': 'ayurvedic_foot',
    'natural healing - ayurvedic foot massage': 'ayurvedic_foot',
    'ayurvedic foot massage': 'ayurvedic_foot',
    'natural healing – energy healing for children': 'energy_healing_children',
    'natural healing - energy healing for children': 'energy_healing_children',
    'energy healing for children': 'energy_healing_children',
    'bodyroll massage machine': 'bodyroll',
    bodyroll: 'bodyroll',
    'body roll': 'bodyroll',
    'infrared sauna pod': 'infrared_sauna',
    'infrared wellness sauna pod': 'infrared_sauna',
    'infrared sauna': 'infrared_sauna',
    'infrared sauna pod + shrinking violet': 'infrared_sauna_shrinking_violet',
    'shrinking violet infrared sauna pod treatment': 'infrared_sauna_shrinking_violet',
    'shrinking violet': 'infrared_sauna_shrinking_violet',
    'normatec recovery boots': 'normatec_boots',
    'normatec boots': 'normatec_boots',
    normatec: 'normatec_boots',
    'bodyroll + bodypod combo': 'bodyroll_bodypod_combo',
    'bodyroll bodypod combo': 'bodyroll_bodypod_combo',
    'wellness kickstart': 'wellness_kickstart',
};

// ─── Mock booking counts (used when no CSV is available) ─────────────────
const MOCK_BOOKINGS: Record<string, number> = {
    relaxation_massage: 3,
    remedial_massage: 10,
    pregnancy_massage: 3,
    reiki: 4,
    chakra_balance: 2,
    aromatouch: 5,
    ayurvedic_foot: 4,
    energy_healing_children: 3,
    bodyroll: 2,
    infrared_sauna: 1,
    infrared_sauna_shrinking_violet: 4,
    normatec_boots: 1,
    bodyroll_bodypod_combo: 4,
    wellness_kickstart: 5,
};

// ─── Agent ────────────────────────────────────────────────────────────────

export class FreshaWatcherAgent {
    private services = getAllServices();
    private exportsDir = resolve(settings.dataDir, 'fresha-exports');

    async run(): Promise<AvailabilitySignals> {
        console.log('[FreshaWatcher] Checking booking availability...');
        mkdirSync(this.exportsDir, { recursive: true });

        // Attempt automated download if credentials are configured
        await this.tryAutoDownload();

        const bookingCounts = this.getBookingCounts();
        const signals = this.computeSignals(bookingCounts);
        saveAvailabilitySignals(signals);

        const push = Object.values(signals)
            .filter((v) => v.signal === 'push')
            .map((v) => v.serviceName);
        const pause = Object.values(signals)
            .filter((v) => v.signal === 'pause')
            .map((v) => v.serviceName);
        console.log(`[FreshaWatcher] PUSH:  ${push.join(', ') || '(none)'}`);
        console.log(`[FreshaWatcher] PAUSE: ${pause.join(', ') || '(none)'}`);

        return signals;
    }

    /**
     * Get booking counts per service. Uses latest CSV export if available,
     * otherwise falls back to mock data for development.
     */
    private getBookingCounts(): Record<string, number> {
        const csvPath = this.findLatestCsv();

        if (csvPath) {
            console.log(`[FreshaWatcher] Parsing: ${csvPath}`);
            return this.parseCsv(csvPath);
        }

        console.warn(
            '[FreshaWatcher] No CSV found in data/fresha-exports/ — using mock data.\n' +
                '  Export from Fresha: Sales → Appointments → next 14 days → Export CSV\n' +
                `  Place the file in: ${this.exportsDir}`
        );
        return MOCK_BOOKINGS;
    }

    /** Find the most recently modified CSV in the exports directory. */
    private findLatestCsv(): string | null {
        try {
            const files = readdirSync(this.exportsDir)
                .filter((f) => f.toLowerCase().endsWith('.csv'))
                .map((f) => ({
                    path: resolve(this.exportsDir, f),
                    mtime: statSync(resolve(this.exportsDir, f)).mtime.getTime(),
                }))
                .sort((a, b) => b.mtime - a.mtime);

            return files[0]?.path ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Parse a Fresha appointments CSV export.
     * Counts confirmed future bookings per service within the next 14 days.
     * Returns: { service_id: booking_count }
     */
    parseCsv(csvPath: string): Record<string, number> {
        const raw = readFileSync(csvPath, 'utf-8');
        // Handle Windows line endings
        const lines = raw
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
            .filter((l) => l.trim());

        if (lines.length < 2) {
            console.warn('[FreshaWatcher] CSV appears empty or has only a header row');
            return {};
        }

        // Detect column positions from header row
        const headers = this.parseCsvRow(lines[0]).map((h) => h.trim().replace(/^"|"$/g, ''));
        const serviceCol = this.findCol(headers, SERVICE_COL_ALIASES);
        const dateCol = this.findCol(headers, DATE_COL_ALIASES);
        const statusCol = this.findCol(headers, STATUS_COL_ALIASES);

        if (serviceCol === -1) {
            console.error(
                `[FreshaWatcher] Could not find a service column. Headers found: [${headers.join(', ')}]\n` +
                    `  Expected one of: ${SERVICE_COL_ALIASES.join(', ')}\n` +
                    `  Check your Fresha CSV export and update SERVICE_COL_ALIASES if needed.`
            );
            return {};
        }

        const now = new Date();
        const cutoff = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        const counts: Record<string, number> = {};
        const unknownServices = new Set<string>();
        let totalParsed = 0;

        for (let i = 1; i < lines.length; i++) {
            const cols = this.parseCsvRow(lines[i]);
            if (cols.length < 2) continue;

            const serviceName = (cols[serviceCol] ?? '').trim().replace(/^"|"$/g, '');
            const dateStr = dateCol !== -1 ? (cols[dateCol] ?? '').trim() : '';
            const statusRaw = statusCol !== -1 ? (cols[statusCol] ?? '').trim().toLowerCase() : 'booked';

            // Skip non-booked statuses (cancelled, no-show, completed, etc.)
            if (statusRaw && !BOOKED_STATUSES.some((s) => statusRaw.includes(s))) continue;

            // Filter to next 14 days only (if date column present)
            if (dateStr) {
                const apptDate = this.parseDate(dateStr);
                if (apptDate && (apptDate < now || apptDate > cutoff)) continue;
            }

            const serviceId = this.resolveServiceId(serviceName);
            if (!serviceId) {
                unknownServices.add(serviceName);
                continue;
            }

            counts[serviceId] = (counts[serviceId] ?? 0) + 1;
            totalParsed++;
        }

        if (unknownServices.size > 0) {
            console.warn(
                `[FreshaWatcher] Unrecognised service names in CSV (add to SERVICE_NAME_MAP):\n` +
                    `  ${[...unknownServices].map((s) => `"${s}"`).join(', ')}`
            );
        }

        const totalBookings = Object.values(counts).reduce((a, b) => a + b, 0);
        console.log(
            `[FreshaWatcher] Found ${totalBookings} confirmed bookings across ${Object.keys(counts).length} services`
        );
        return counts;
    }

    /**
     * Convert booking counts → PUSH/HOLD/PAUSE availability signals.
     * Available slots = weeklyCapacity − currentBookings
     */
    private computeSignals(bookingCounts: Record<string, number>): AvailabilitySignals {
        const signals: AvailabilitySignals = {};

        for (const service of this.services) {
            const booked = bookingCounts[service.id] ?? 0;
            // weeklyCapacity is defined in services.yaml; estimate = pushThreshold + 4 if not set
            const capacity =
                (service as unknown as Record<string, number>)['weeklyCapacity'] ?? service.pushThreshold + 4;
            const available = Math.max(0, capacity - booked);

            let signal: AvailabilitySignal;
            if (available >= service.pushThreshold) signal = 'push';
            else if (available <= service.pauseThreshold) signal = 'pause';
            else signal = 'hold';

            signals[service.id] = {
                serviceId: service.id,
                serviceName: service.name,
                availableSlots: available,
                signal,
                pushThreshold: service.pushThreshold,
                pauseThreshold: service.pauseThreshold,
                recordedAt: new Date().toISOString(),
            };
        }

        return signals;
    }

    // ── Parsing helpers ─────────────────────────────────────────────────────

    private parseCsvRow(line: string): string[] {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                // Escaped quote inside quoted field
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        result.push(current.trim());
        return result;
    }

    private findCol(headers: string[], aliases: string[]): number {
        const lower = headers.map((h) => h.toLowerCase());
        for (const alias of aliases) {
            const idx = lower.indexOf(alias.toLowerCase());
            if (idx !== -1) return idx;
        }
        return -1;
    }

    private resolveServiceId(name: string): string | null {
        const key = name.toLowerCase().trim();
        if (SERVICE_NAME_MAP[key]) return SERVICE_NAME_MAP[key];
        // Partial match fallback
        for (const [pattern, id] of Object.entries(SERVICE_NAME_MAP)) {
            if (key.includes(pattern) || pattern.includes(key)) return id;
        }
        return null;
    }

    private parseDate(dateStr: string): Date | null {
        // DD/MM/YYYY
        const dmy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dmy) return new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`);
        // YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return new Date(dateStr);
        // DD-MM-YYYY
        const dmy2 = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
        if (dmy2) return new Date(`${dmy2[3]}-${dmy2[2].padStart(2, '0')}-${dmy2[1].padStart(2, '0')}`);
        // D Month YYYY (e.g. "5 March 2025")
        const longDate = new Date(dateStr);
        if (!isNaN(longDate.getTime())) return longDate;
        return null;
    }

    getLatestSignals(): AvailabilitySignals {
        return getLatestSignals();
    }

    /**
     * Attempt to auto-download the Fresha CSV using Playwright.
     * Silently skips if credentials aren't configured or Playwright isn't installed.
     */
    private async tryAutoDownload(): Promise<void> {
        if (!process.env.FRESHA_EMAIL || !process.env.FRESHA_PASSWORD) {
            console.warn(
                '[FreshaWatcher] FRESHA_EMAIL and FRESHA_PASSWORD not set in .env — skipping auto-download.\n' +
                    '  Add them to .env or export the CSV manually from Fresha.'
            );
            return;
        }

        try {
            const { FreshaDownloader } = await import('./downloader.js');
            const dl = new FreshaDownloader();
            const path = await dl.downloadAppointmentsCsv();
            if (path) {
                console.log(`[FreshaWatcher] Auto-downloaded CSV: ${path}`);
            }
        } catch (err) {
            // Playwright not installed or download failed — fall back to existing CSV
            console.warn(
                `[FreshaWatcher] Auto-download unavailable (${String(err).slice(0, 80)}) — using existing CSV or mock data`
            );
        }
    }
}
