// src/agents/fresha-watcher/agent.ts
// Polls Fresha booking data daily and produces PUSH/HOLD/PAUSE signals per service.

import { settings, getAllServices } from "../../config.js";
import { saveAvailabilitySignals, getLatestSignals } from "../../db.js";
import type { AvailabilitySignal, AvailabilitySignals, ServiceAvailabilityData } from "../../types.js";

// ─── Mock data for development ────────────────────────────────────────────

const MOCK_AVAILABILITY: Record<string, { name: string; slots: number }> = {
  relaxation_massage:              { name: "Relaxation Massage", slots: 12 },
  remedial_massage:                { name: "Remedial Massage", slots: 3 },
  pregnancy_massage:               { name: "Pregnancy Massage", slots: 2 },
  reiki:                           { name: "Natural Healing – Reiki", slots: 8 },
  chakra_balance:                  { name: "Natural Healing – Chakra Balance", slots: 10 },
  aromatouch:                      { name: "AromaTouch Technique", slots: 7 },
  ayurvedic_foot:                  { name: "Ayurvedic Foot Massage", slots: 6 },
  energy_healing_children:         { name: "Energy Healing for Children", slots: 1 },
  bodyroll:                        { name: "BodyROLL Massage Machine", slots: 14 },
  infrared_sauna:                  { name: "Infrared Sauna POD", slots: 18 },
  infrared_sauna_shrinking_violet: { name: "Infrared Sauna + Shrinking Violet", slots: 9 },
  normatec_boots:                  { name: "NormaTec Recovery Boots", slots: 20 },
  bodyroll_bodypod_combo:          { name: "BodyROLL + BodyPOD Combo", slots: 8 },
  wellness_kickstart:              { name: "Wellness Kickstart", slots: 5 },
};

// ─── Agent ────────────────────────────────────────────────────────────────

export class FreshaWatcherAgent {
  private services = getAllServices();

  async run(): Promise<AvailabilitySignals> {
    console.log("[FreshaWatcher] Starting availability check...");

    const rawAvailability = await this.fetchAvailability();
    const signals = this.computeSignals(rawAvailability);
    saveAvailabilitySignals(signals);

    const pushServices = Object.entries(signals)
      .filter(([, v]) => v.signal === "push")
      .map(([, v]) => v.serviceName);
    const pauseServices = Object.entries(signals)
      .filter(([, v]) => v.signal === "pause")
      .map(([, v]) => v.serviceName);

    console.log(`[FreshaWatcher] Done. PUSH: [${pushServices.join(", ")}]`);
    console.log(`[FreshaWatcher] PAUSE: [${pauseServices.join(", ")}]`);

    return signals;
  }

  /**
   * Fetch available slots per service for the next 7 days.
   *
   * Integration options (configure in .env):
   *
   * Option A — Fresha Data Connector (PostgreSQL):
   *   Enable via Fresha Dashboard → Reports → Data Connections.
   *   Provides SSH-authenticated read-only PostgreSQL access to your Fresha data.
   *   Tables: appointments, services, staff_schedules, clients
   *   Set FRESHA_DB_HOST, FRESHA_DB_NAME, FRESHA_DB_USER, FRESHA_DB_PASSWORD
   *
   * Option B — Google Sheets via Zapier (~30min setup):
   *   Zapier: "New/Updated Appointment in Fresha" → update Google Sheet row.
   *   Agent reads sheet via Google Sheets API.
   *   Set FRESHA_GSHEETS_ID + GOOGLE_SERVICE_ACCOUNT_JSON
   *
   * Option C — Mock data (development/testing, no config required)
   */
  private async fetchAvailability(): Promise<Record<string, { name: string; slots: number }>> {
    if (settings.freshaDb.host) {
      return this.fetchFromPostgres();
    }
    if (settings.freshaGsheetsId) {
      return this.fetchFromGoogleSheets();
    }
    console.warn("[FreshaWatcher] No data source configured — using mock data. Set FRESHA_DB_HOST or FRESHA_GSHEETS_ID in .env");
    return MOCK_AVAILABILITY;
  }

  private async fetchFromPostgres(): Promise<Record<string, { name: string; slots: number }>> {
    // Requires: npm install pg @types/pg
    const { default: pg } = await import("pg");
    const { Pool } = pg;

    const pool = new Pool({
      host: settings.freshaDb.host,
      port: settings.freshaDb.port,
      database: settings.freshaDb.name,
      user: settings.freshaDb.user,
      password: settings.freshaDb.password,
      ssl: { rejectUnauthorized: false },
    });

    try {
      const result = await pool.query(`
        SELECT
          s.id                                          AS service_id,
          s.name                                        AS service_name,
          COUNT(ss.id) - COUNT(a.id)                   AS available_slots
        FROM services s
        JOIN staff_schedules ss
          ON ss.service_id = s.id
          AND ss.date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
        LEFT JOIN appointments a
          ON a.service_id = s.id
          AND a.start_time BETWEEN NOW() AND NOW() + INTERVAL '7 days'
          AND a.status IN ('confirmed', 'pending')
        GROUP BY s.id, s.name
      `);

      return Object.fromEntries(
        result.rows.map((r: { service_id: string; service_name: string; available_slots: string }) => [
          r.service_id,
          { name: r.service_name, slots: parseInt(r.available_slots, 10) },
        ])
      );
    } finally {
      await pool.end();
    }
  }

  private async fetchFromGoogleSheets(): Promise<Record<string, { name: string; slots: number }>> {
    // Requires: npm install googleapis
    // Sheet format: service_id | service_name | available_slots | updated_at
    const { google } = await import("googleapis");
    const auth = new google.auth.GoogleAuth({
      keyFile: settings.googleServiceAccountJson,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: settings.freshaGsheetsId,
      range: "Sheet1!A2:D",
    });

    const rows = response.data.values ?? [];
    return Object.fromEntries(
      rows
        .filter((r) => r[0])
        .map((r) => [r[0] as string, { name: r[1] as string, slots: parseInt(r[2] as string, 10) }])
    );
  }

  private computeSignals(raw: Record<string, { name: string; slots: number }>): AvailabilitySignals {
    const thresholds = this.buildThresholdMap();
    const signals: AvailabilitySignals = {};

    for (const [serviceId, data] of Object.entries(raw)) {
      const t = thresholds[serviceId] ?? {
        push: settings.availabilityPushThreshold,
        pause: settings.availabilityPauseThreshold,
      };

      let signal: AvailabilitySignal;
      if (data.slots >= t.push) signal = "push";
      else if (data.slots <= t.pause) signal = "pause";
      else signal = "hold";

      signals[serviceId] = {
        serviceId,
        serviceName: data.name,
        availableSlots: data.slots,
        signal,
        pushThreshold: t.push,
        pauseThreshold: t.pause,
        recordedAt: new Date().toISOString(),
      };
    }

    return signals;
  }

  private buildThresholdMap(): Record<string, { push: number; pause: number }> {
    return Object.fromEntries(
      this.services.map((s) => [s.id, { push: s.pushThreshold, pause: s.pauseThreshold }])
    );
  }

  /** Get latest signals from DB without re-fetching from Fresha */
  getLatestSignals(): AvailabilitySignals {
    return getLatestSignals();
  }
}

// Run standalone
if (process.argv[1].endsWith("agent.ts") || process.argv[1].endsWith("agent.js")) {
  const agent = new FreshaWatcherAgent();
  agent.run().then((signals) => {
    console.log(JSON.stringify(signals, null, 2));
  });
}
