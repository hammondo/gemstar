// src/agents/fresha-watcher/downloader.ts
//
// Automated Fresha CSV export using Playwright (headless browser).
// Logs into partners.fresha.com, navigates to the appointments report,
// sets the date range to next 14 days, and downloads the CSV.
//
// Setup (one-time):
//   npm run playwright:install
//
// Add to .env:
//   FRESHA_EMAIL=owner@bodyspacerecoverystudio.com.au
//   FRESHA_PASSWORD=your_fresha_password
//
// Runs automatically as part of the daily FreshaWatcherAgent,
// or manually: npm run fresha:download

import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { chromium, type Page } from 'playwright';
import { settings } from '../../config.js';
import { getAgentLogger } from '../../utils/logger.js';

const FRESHA_EMAIL = process.env.FRESHA_EMAIL ?? '';
const FRESHA_PASSWORD = process.env.FRESHA_PASSWORD ?? '';
const EXPORTS_DIR = resolve(settings.dataDir, 'fresha-exports');
const LOGIN_URL = 'https://partners.fresha.com/users/sign-in';
const APPOINTMENT_LIST_URL = 'https://partners.fresha.com/reports/table/appointment-list';

export class FreshaDownloader {
    private readonly log = getAgentLogger('FreshaDownloader');

    /**
     * Download the appointments CSV for the next 14 days.
     * Returns the path to the saved CSV file, or null if download failed.
     */
    async downloadAppointmentsCsv(): Promise<string | null> {
        if (!FRESHA_EMAIL || !FRESHA_PASSWORD) {
            this.log.warn('FRESHA_EMAIL/FRESHA_PASSWORD not set in .env — skipping auto-download');
            return null;
        }

        mkdirSync(EXPORTS_DIR, { recursive: true });

        this.log.info('Launching browser');
        const browser = await chromium.launch({
            headless: true,
            // If running on a server without a display, headless: true is required.
            // Set PLAYWRIGHT_HEADED=1 in .env to watch it run for debugging.
            ...(process.env.PLAYWRIGHT_HEADED === '1' ? { headless: false } : {}),
        });

        try {
            const context = await browser.newContext({
                // Set download path so we know exactly where the file lands
                acceptDownloads: true,
            });
            const page = await context.newPage();
            this.attachNetworkLogging(page);

            // ── Step 1: Log in ──────────────────────────────────────────────
            await this.login(page);

            // ── Step 2: Navigate to appointment list report ─────────────────────
            await this.navigateToReport(page);

            // ── Step 3: Set date range to next 30 days ──────────────────────
            await this.setDateRange(page);

            // ── Step 4: Download CSV ────────────────────────────────────────
            const csvPath = await this.downloadCsv(page);

            await context.close();
            this.log.info({ csvPath }, 'Download completed');
            return csvPath;
        } catch (err) {
            this.log.error({ error: String(err) }, 'Download failed');
            // Take a screenshot for debugging
            try {
                const page = (await browser.contexts()[0]?.pages())?.[0];
                if (page) {
                    const screenshotPath = resolve(EXPORTS_DIR, 'debug-screenshot.png');
                    await page.screenshot({ path: screenshotPath, fullPage: true });
                    this.log.info({ screenshotPath }, 'Debug screenshot saved');
                }
            } catch {
                /* ignore screenshot errors */
            }
            return null;
        } finally {
            await browser.close();
        }
    }

    // ── Private steps ───────────────────────────────────────────────────────

    private async login(page: Page): Promise<void> {
        this.log.info('Logging in');
        await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });

        // Step 1: Fill email
        await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', FRESHA_EMAIL);

        // Step 2: Click Continue to proceed to password step
        await page.click('button[type="submit"], button:has-text("Continue")');

        // Step 3: Wait for password field to appear, then fill it
        const passwordInput = page.locator('input[type="password"], input[name="password"]');
        await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
        await passwordInput.fill(FRESHA_PASSWORD);

        // Step 4: Click Sign in
        await page.click('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")');

        // Wait for dashboard to load (URL changes away from /sign-in)
        await page.waitForURL((url) => !url.toString().includes('/sign-in') && !url.toString().includes('/login'), {
            timeout: 15000,
        });
        this.log.info('Logged in successfully');
    }

    private async navigateToReport(page: Page): Promise<void> {
        this.log.info('Navigating to appointment list report');
        await page.goto(APPOINTMENT_LIST_URL, { waitUntil: 'networkidle' });

        // If redirected to a different reports path, try Sales → Appointments via nav
        if (!page.url().includes('appointment-list')) {
            this.log.warn({ currentUrl: page.url() }, 'Unexpected URL after navigation');
        }
    }

    private async setDateRange(page: Page): Promise<void> {
        this.log.info('Setting date range to next 30 days');

        await page.getByText('Last 30 days').click();

        // const dateRangeButton = page.locator('button:has-text("Last 30 days"), button:has-text("Next 30 days")');
        // await dateRangeButton.click();

        const dateRangeSelect = await page.locator('select');
        await dateRangeSelect.waitFor({ state: 'visible', timeout: 5000 });
        await dateRangeSelect.selectOption({ value: 'next_30_days' });

        // const dateRangeSelect = page.locator('select');
        // await dateRangeSelect.selectOption({ value: 'next_30_days' });

        const today = new Date();
        const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

        const formatDate = (d: Date) =>
            `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;

        const todayStr = formatDate(today);
        const endStr = formatDate(endDate);

        // // Look for date range picker — Fresha uses various implementations
        // // Try clicking a date range button/dropdown first
        // const dateRangeBtn = page
        //     .locator(
        //         'button:has-text("Last 30 days"), button:has-text("Date"), [data-testid*="date"], .date-range-picker button'
        //     )
        //     .first();

        // if (await dateRangeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        //     await dateRangeBtn.click();
        //     await page.waitForTimeout(500);

        //     // Try selecting "Custom range" option
        //     const customRange = page
        //         .locator('li:has-text("Custom"), button:has-text("Custom"), option:has-text("Custom")')
        //         .first();
        //     if (await customRange.isVisible({ timeout: 2000 }).catch(() => false)) {
        //         await customRange.click();
        //         await page.waitForTimeout(300);
        //     }
        // }

        // // Fill in start date input
        // const startInput = page
        //     .locator(
        //         'input[placeholder*="start" i], input[placeholder*="from" i], input[name*="start" i], input[name*="from" i], input[aria-label*="start" i]'
        //     )
        //     .first();

        // if (await startInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        //     await startInput.click({ clickCount: 3 });
        //     await startInput.fill(todayStr);
        // }

        // // Fill in end date input
        // const endInput = page
        //     .locator(
        //         'input[placeholder*="end" i], input[placeholder*="to" i], input[name*="end" i], input[name*="to" i], input[aria-label*="end" i]'
        //     )
        //     .first();

        // if (await endInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        //     await endInput.click({ clickCount: 3 });
        //     await endInput.fill(endStr);
        // }

        // Apply/confirm the date selection
        const applyBtn = page
            .locator('button:has-text("Apply"), button:has-text("Confirm"), button:has-text("Search")')
            .first();
        if (await applyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await applyBtn.click();
        } else {
            await page.keyboard.press('Enter');
        }

        await page.waitForLoadState('networkidle');
        this.log.info({ from: todayStr, to: endStr }, 'Date range set');
    }

    private async downloadCsv(page: Page): Promise<string> {
        this.log.info('Triggering CSV download');

        // Set up download handler BEFORE clicking the button
        const downloadPromise = page.waitForEvent('download', {
            timeout: 120000,
        });

        // Click options to expand the drop-down
        const optionsButton = page.locator('button[data-qa="button-open-dropdown"]').first();
        if (await optionsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
            await optionsButton.click();
        }

        // Find and click the Export/Download button
        // const exportBtn = page.getByRole('menuitem', { name: /csv|CSV/i }).first();
        // await exportBtn.waitFor({ state: 'visible', timeout: 1000 });
        // await exportBtn.click();

        // Fresha renders CSV as a list item with data-key="csv". Keep this selector strict
        // so we do not accidentally click the XLSX option directly below it.
        const csvOption = page.locator('li[data-key="csv"]').first();
        await csvOption.waitFor({ state: 'visible', timeout: 5000 });
        await csvOption.scrollIntoViewIfNeeded();
        await csvOption.click();

        // Wait for the download to complete
        const download = await downloadPromise;
        const filename = `appointments_${new Date().toISOString().slice(0, 10)}.csv`;
        const savePath = resolve(EXPORTS_DIR, filename);

        this.log.info({ suggestedFilename: download.suggestedFilename(), savePath }, 'Download event received');
        await download.saveAs(savePath);
        this.normalizeCsvToUtf8(savePath);

        // Clean up older exports (keep last 5 only)
        this.pruneOldExports(5);

        return savePath;
    }

    private attachNetworkLogging(page: Page): void {
        page.on('request', (request) => {
            const type = request.resourceType();
            if (type !== 'document' && type !== 'xhr' && type !== 'fetch') return;
            this.log.info(
                {
                    event: 'outbound.request',
                    system: 'fresha',
                    operation: 'playwright_request',
                    method: request.method(),
                    url: request.url(),
                    resourceType: type,
                },
                'Outbound request started'
            );
        });

        page.on('response', (response) => {
            const request = response.request();
            const type = request.resourceType();
            if (type !== 'document' && type !== 'xhr' && type !== 'fetch') return;
            const payload = {
                event: 'outbound.response',
                system: 'fresha',
                operation: 'playwright_request',
                method: request.method(),
                url: request.url(),
                status: response.status(),
                ok: response.ok(),
                resourceType: type,
            };
            if (response.ok()) {
                this.log.info(payload, 'Outbound response received');
            } else {
                this.log.warn(payload, 'Outbound response received');
            }
        });

        page.on('requestfailed', (request) => {
            const type = request.resourceType();
            if (type !== 'document' && type !== 'xhr' && type !== 'fetch') return;
            this.log.error(
                {
                    event: 'outbound.error',
                    system: 'fresha',
                    operation: 'playwright_request',
                    method: request.method(),
                    url: request.url(),
                    resourceType: type,
                    error: request.failure()?.errorText,
                },
                'Outbound request failed'
            );
        });
    }

    private normalizeCsvToUtf8(filePath: string): void {
        const raw = readFileSync(filePath);
        if (raw.length === 0) {
            throw new Error('[FreshaDownloader] Downloaded CSV is empty');
        }

        // ZIP signatures usually indicate we downloaded Excel/ZIP content, not a plain CSV.
        if (
            (raw[0] === 0x50 && raw[1] === 0x4b && raw[2] === 0x03 && raw[3] === 0x04) ||
            (raw[0] === 0x50 && raw[1] === 0x4b && raw[2] === 0x05 && raw[3] === 0x06) ||
            (raw[0] === 0x50 && raw[1] === 0x4b && raw[2] === 0x07 && raw[3] === 0x08)
        ) {
            throw new Error('[FreshaDownloader] Downloaded file appears to be ZIP/Excel content, not CSV');
        }

        let text: string;

        // UTF-8 BOM
        if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
            text = raw.toString('utf8');
        }
        // UTF-16 LE BOM
        else if (raw[0] === 0xff && raw[1] === 0xfe) {
            text = raw.subarray(2).toString('utf16le');
        }
        // UTF-16 BE BOM
        else if (raw[0] === 0xfe && raw[1] === 0xff) {
            text = this.decodeUtf16Be(raw.subarray(2));
        }
        // UTF-16 LE (no BOM) heuristic
        else if (this.looksLikeUtf16Le(raw)) {
            text = raw.toString('utf16le');
        } else {
            text = raw.toString('utf8');
        }

        const normalized = text.replace(/^\uFEFF/, '');

        if (!this.looksLikeCsv(normalized)) {
            throw new Error('[FreshaDownloader] Downloaded content does not look like CSV text');
        }

        writeFileSync(filePath, normalized, { encoding: 'utf8' });
    }

    private decodeUtf16Be(raw: Buffer): string {
        const evenLength = raw.length - (raw.length % 2);
        const swapped = Buffer.allocUnsafe(evenLength);
        for (let i = 0; i < evenLength; i += 2) {
            swapped[i] = raw[i + 1];
            swapped[i + 1] = raw[i];
        }
        return swapped.toString('utf16le');
    }

    private looksLikeUtf16Le(raw: Buffer): boolean {
        const sampleLength = Math.min(raw.length, 512);
        let oddNuls = 0;
        let evenNuls = 0;

        for (let i = 0; i < sampleLength; i++) {
            if (raw[i] === 0x00) {
                if (i % 2 === 0) {
                    evenNuls += 1;
                } else {
                    oddNuls += 1;
                }
            }
        }

        return oddNuls >= 8 && oddNuls > evenNuls * 3;
    }

    private looksLikeCsv(text: string): boolean {
        const lines = text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (lines.length < 2) {
            return false;
        }

        // Accept comma, semicolon, or tab-delimited CSV variants.
        return /,|;|\t/.test(lines[0]);
    }

    private pruneOldExports(keepCount: number): void {
        try {
            const files = readdirSync(EXPORTS_DIR)
                .filter((f) => f.toLowerCase().endsWith('.csv'))
                .map((f) => ({ name: f, path: resolve(EXPORTS_DIR, f) }))
                .sort((a, b) => b.name.localeCompare(a.name)); // newest first (ISO date in filename)

            for (const file of files.slice(keepCount)) {
                unlinkSync(file.path);
                console.log(`[FreshaDownloader] Pruned old export: ${file.name}`);
            }
        } catch {
            /* ignore */
        }
    }
}
