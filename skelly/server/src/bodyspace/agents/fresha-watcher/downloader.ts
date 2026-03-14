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

import { chromium, type Browser, type Page } from "playwright";
import { mkdirSync, readdirSync, unlinkSync } from "fs";
import { resolve } from "path";
import { settings } from "../../config.js";

const FRESHA_EMAIL = process.env.FRESHA_EMAIL ?? "";
const FRESHA_PASSWORD = process.env.FRESHA_PASSWORD ?? "";
const EXPORTS_DIR = resolve(settings.dataDir, "fresha-exports");
const LOGIN_URL = "https://partners.fresha.com/users/sign-in";
const APPOINTMENTS_URL = "https://partners.fresha.com/reports/appointments";

export class FreshaDownloader {
  /**
   * Download the appointments CSV for the next 14 days.
   * Returns the path to the saved CSV file, or null if download failed.
   */
  async downloadAppointmentsCsv(): Promise<string | null> {
    if (!FRESHA_EMAIL || !FRESHA_PASSWORD) {
      console.warn(
        "[FreshaDownloader] FRESHA_EMAIL and FRESHA_PASSWORD not set in .env — skipping auto-download.\n" +
          "  Add them to .env or export the CSV manually from Fresha.",
      );
      return null;
    }

    mkdirSync(EXPORTS_DIR, { recursive: true });

    console.log("[FreshaDownloader] Launching browser...");
    const browser = await chromium.launch({
      headless: true,
      // If running on a server without a display, headless: true is required.
      // Set PLAYWRIGHT_HEADED=1 in .env to watch it run for debugging.
      ...(process.env.PLAYWRIGHT_HEADED === "1" ? { headless: false } : {}),
    });

    try {
      const context = await browser.newContext({
        // Set download path so we know exactly where the file lands
        acceptDownloads: true,
      });
      const page = await context.newPage();

      // ── Step 1: Log in ──────────────────────────────────────────────
      await this.login(page);

      // ── Step 2: Navigate to appointments report ─────────────────────
      await this.navigateToReport(page);

      // ── Step 3: Set date range to next 14 days ──────────────────────
      await this.setDateRange(page);

      // ── Step 4: Download CSV ────────────────────────────────────────
      const csvPath = await this.downloadCsv(page);

      await context.close();
      console.log(`[FreshaDownloader] Downloaded: ${csvPath}`);
      return csvPath;
    } catch (err) {
      console.error("[FreshaDownloader] Failed:", String(err));
      // Take a screenshot for debugging
      try {
        const page = (await browser.contexts()[0]?.pages())?.[0];
        if (page) {
          const screenshotPath = resolve(EXPORTS_DIR, "debug-screenshot.png");
          await page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(
            `[FreshaDownloader] Debug screenshot saved: ${screenshotPath}`,
          );
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
    console.log("[FreshaDownloader] Logging in...");
    await page.goto(LOGIN_URL, { waitUntil: "networkidle" });

    // Step 1: Fill email
    await page.fill(
      'input[type="email"], input[name="email"], input[placeholder*="email" i]',
      FRESHA_EMAIL,
    );

    // Step 2: Click Continue to proceed to password step
    await page.click('button[type="submit"], button:has-text("Continue")');

    // Step 3: Wait for password field to appear, then fill it
    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]',
    );
    await passwordInput.waitFor({ state: "visible", timeout: 10000 });
    await passwordInput.fill(FRESHA_PASSWORD);

    // Step 4: Click Sign in
    await page.click(
      'button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")',
    );

    // Wait for dashboard to load (URL changes away from /sign-in)
    await page.waitForURL(
      (url) =>
        !url.toString().includes("/sign-in") &&
        !url.toString().includes("/login"),
      { timeout: 15000 },
    );
    console.log("[FreshaDownloader] Logged in successfully");
  }

  private async navigateToReport(page: Page): Promise<void> {
    console.log("[FreshaDownloader] Navigating to appointments report...");
    await page.goto(APPOINTMENTS_URL, { waitUntil: "networkidle" });

    // If redirected to a different reports path, try Sales → Appointments via nav
    if (!page.url().includes("appointments")) {
      // Try navigating via the sidebar
      const reportLinks = page.locator(
        'a:has-text("Appointments"), nav a[href*="appointment"]',
      );
      if ((await reportLinks.count()) > 0) {
        await reportLinks.first().click();
        await page.waitForLoadState("networkidle");
      }
    }
  }

  private async setDateRange(page: Page): Promise<void> {
    console.log("[FreshaDownloader] Setting date range to next 14 days...");

    const today = new Date();
    const endDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

    const formatDate = (d: Date) =>
      `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;

    const todayStr = formatDate(today);
    const endStr = formatDate(endDate);

    // Look for date range picker — Fresha uses various implementations
    // Try clicking a date range button/dropdown first
    const dateRangeBtn = page
      .locator(
        'button:has-text("Today"), button:has-text("Date"), [data-testid*="date"], .date-range-picker button',
      )
      .first();

    if (await dateRangeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dateRangeBtn.click();
      await page.waitForTimeout(500);

      // Try selecting "Custom range" option
      const customRange = page
        .locator(
          'li:has-text("Custom"), button:has-text("Custom"), option:has-text("Custom")',
        )
        .first();
      if (await customRange.isVisible({ timeout: 2000 }).catch(() => false)) {
        await customRange.click();
        await page.waitForTimeout(300);
      }
    }

    // Fill in start date input
    const startInput = page
      .locator(
        'input[placeholder*="start" i], input[placeholder*="from" i], input[name*="start" i], input[name*="from" i], input[aria-label*="start" i]',
      )
      .first();

    if (await startInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await startInput.click({ clickCount: 3 });
      await startInput.fill(todayStr);
    }

    // Fill in end date input
    const endInput = page
      .locator(
        'input[placeholder*="end" i], input[placeholder*="to" i], input[name*="end" i], input[name*="to" i], input[aria-label*="end" i]',
      )
      .first();

    if (await endInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await endInput.click({ clickCount: 3 });
      await endInput.fill(endStr);
    }

    // Apply/confirm the date selection
    const applyBtn = page
      .locator(
        'button:has-text("Apply"), button:has-text("Confirm"), button:has-text("Search")',
      )
      .first();
    if (await applyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await applyBtn.click();
    } else {
      await page.keyboard.press("Enter");
    }

    await page.waitForLoadState("networkidle");
    console.log(`[FreshaDownloader] Date range set: ${todayStr} → ${endStr}`);
  }

  private async downloadCsv(page: Page): Promise<string> {
    console.log("[FreshaDownloader] Triggering CSV download...");

    // Set up download handler BEFORE clicking the button
    const downloadPromise = page.waitForEvent("download", { timeout: 30000 });

    // Find and click the Export/Download button
    const exportBtn = page
      .locator(
        'button:has-text("Export"), button:has-text("Download"), button:has-text("CSV"), a:has-text("Export"), a:has-text("Download CSV"), [data-testid*="export"], [aria-label*="export" i]',
      )
      .first();

    await exportBtn.waitFor({ state: "visible", timeout: 10000 });
    await exportBtn.click();

    // If a dropdown appeared (e.g. "Export as CSV" / "Export as Excel"), click CSV
    const csvOption = page
      .locator('li:has-text("CSV"), button:has-text("CSV"), a:has-text("CSV")')
      .first();
    if (await csvOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await csvOption.click();
    }

    // Wait for the download to complete
    const download = await downloadPromise;
    const filename = `appointments_${new Date().toISOString().slice(0, 10)}.csv`;
    const savePath = resolve(EXPORTS_DIR, filename);

    await download.saveAs(savePath);

    // Clean up older exports (keep last 5 only)
    this.pruneOldExports(5);

    return savePath;
  }

  private pruneOldExports(keepCount: number): void {
    try {
      const files = readdirSync(EXPORTS_DIR)
        .filter((f) => f.toLowerCase().endsWith(".csv"))
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
