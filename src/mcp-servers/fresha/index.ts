// src/mcp-servers/fresha/index.ts
// MCP server providing read-only access to Fresha booking availability data.
//
// Fresha does not offer a public REST API. This server connects via:
//   Option A: Fresha Data Connector → PostgreSQL export
//             (Enable: Fresha Dashboard → Reports → Data Connections)
//   Option B: Google Sheets populated by a Zapier/Make automation

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "fresha-mcp-server",
  version: "1.0.0",
});

// ── Shared DB/Sheets helpers ──────────────────────────────────────────────

async function getAvailabilityFromPostgres(
  daysAhead: number
): Promise<Array<{ serviceId: string; serviceName: string; availableSlots: number; bookedSlots: number; totalSlots: number }>> {
  const { default: pg } = await import("pg");
  const { Pool } = pg;

  const pool = new Pool({
    host: process.env.FRESHA_DB_HOST,
    port: parseInt(process.env.FRESHA_DB_PORT ?? "5432"),
    database: process.env.FRESHA_DB_NAME,
    user: process.env.FRESHA_DB_USER,
    password: process.env.FRESHA_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const result = await pool.query(`
      SELECT
        s.id                              AS service_id,
        s.name                            AS service_name,
        COUNT(ss.id)                      AS total_slots,
        COUNT(a.id)                       AS booked_slots,
        COUNT(ss.id) - COUNT(a.id)        AS available_slots
      FROM services s
      JOIN staff_schedules ss
        ON ss.service_id = s.id
       AND ss.date BETWEEN NOW() AND NOW() + ($1 || ' days')::INTERVAL
      LEFT JOIN appointments a
        ON a.service_id = s.id
       AND a.start_time BETWEEN NOW() AND NOW() + ($1 || ' days')::INTERVAL
       AND a.status IN ('confirmed', 'pending')
      GROUP BY s.id, s.name
      ORDER BY s.name
    `, [daysAhead]);

    return result.rows.map((r: Record<string, string>) => ({
      serviceId: r.service_id,
      serviceName: r.service_name,
      availableSlots: parseInt(r.available_slots, 10),
      bookedSlots: parseInt(r.booked_slots, 10),
      totalSlots: parseInt(r.total_slots, 10),
    }));
  } finally {
    await pool.end();
  }
}

async function getAvailabilityFromSheets(): Promise<Array<{ serviceId: string; serviceName: string; availableSlots: number }>> {
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.FRESHA_GSHEETS_ID,
    range: "Sheet1!A2:D",
  });
  return (response.data.values ?? [])
    .filter((r) => r[0])
    .map((r) => ({
      serviceId: r[0] as string,
      serviceName: r[1] as string,
      availableSlots: parseInt(r[2] as string, 10),
    }));
}

// ── Tool: get_availability ────────────────────────────────────────────────

server.registerTool(
  "fresha_get_availability",
  {
    title: "Get Fresha Service Availability",
    description: `Get booking availability for all BodySpace services over the next N days.
Returns available slots per service — used to determine which services need marketing push.

Requires either FRESHA_DB_HOST (PostgreSQL data connector) or FRESHA_GSHEETS_ID (Google Sheets).`,
    inputSchema: {
      days_ahead: z.number().int().min(1).max(28).default(7)
        .describe("How many days ahead to check availability (default: 7)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  async ({ days_ahead }) => {
    try {
      let rows: Array<{ serviceId: string; serviceName: string; availableSlots: number }>;

      if (process.env.FRESHA_DB_HOST) {
        rows = await getAvailabilityFromPostgres(days_ahead);
      } else if (process.env.FRESHA_GSHEETS_ID) {
        rows = await getAvailabilityFromSheets();
      } else {
        return {
          content: [{
            type: "text" as const,
            text: "No Fresha data source configured. Set FRESHA_DB_HOST or FRESHA_GSHEETS_ID in .env",
          }],
        };
      }

      const output = { daysAhead: days_ahead, services: rows, fetchedAt: new Date().toISOString() };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error fetching availability: ${String(err)}` }] };
    }
  },
);

// ── Tool: get_service_availability ───────────────────────────────────────

server.registerTool(
  "fresha_get_service_availability",
  {
    title: "Get Availability for a Specific Service",
    description: "Get booking slot availability for a specific BodySpace service by name or ID.",
    inputSchema: {
      service_name: z.string().describe("Service name or partial name e.g. 'Infrared Sauna', 'NormaTec'"),
      days_ahead: z.number().int().min(1).max(28).default(7).describe("Days ahead to check"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ service_name, days_ahead }) => {
    try {
      let rows: Array<{ serviceId: string; serviceName: string; availableSlots: number }>;

      if (process.env.FRESHA_DB_HOST) {
        rows = await getAvailabilityFromPostgres(days_ahead);
      } else if (process.env.FRESHA_GSHEETS_ID) {
        rows = await getAvailabilityFromSheets();
      } else {
        return { content: [{ type: "text" as const, text: "No Fresha data source configured." }] };
      }

      const filtered = rows.filter((r) =>
        r.serviceName.toLowerCase().includes(service_name.toLowerCase())
      );

      if (filtered.length === 0) {
        return { content: [{ type: "text" as const, text: `No service found matching '${service_name}'` }] };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(filtered, null, 2) }],
        structuredContent: { services: filtered },
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }] };
    }
  },
);

// ── Start ─────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
