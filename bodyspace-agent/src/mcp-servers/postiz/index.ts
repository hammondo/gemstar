// src/mcp-servers/postiz/index.ts
// MCP server wrapping the Postiz social media scheduling API.
// Postiz: https://github.com/gitroomhq/postiz-app (self-hosted or cloud)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const POSTIZ_API_URL = process.env.POSTIZ_API_URL ?? "http://localhost:3000";
const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY ?? "";

const headers = {
  "Authorization": `Bearer ${POSTIZ_API_KEY}`,
  "Content-Type": "application/json",
};

async function postizRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${POSTIZ_API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Postiz API ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

// ─── MCP Server ───────────────────────────────────────────────────────────

const server = new McpServer({
  name: "postiz-mcp-server",
  version: "1.0.0",
});

// ── Tool: list_accounts ──────────────────────────────────────────────────

server.registerTool(
  "postiz_list_accounts",
  {
    title: "List Connected Social Accounts",
    description: `List all social media accounts connected to Postiz (Instagram, Facebook, etc).
Returns account IDs needed for scheduling posts.
Use this to find the correct account_id before calling postiz_schedule_post.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async () => {
    try {
      const accounts = await postizRequest<Array<{
        id: string; providerIdentifier: string; name: string; internalId: string; tokenExpired?: boolean;
      }>>("GET", "/api/integrations");

      const output = accounts.map((a) => ({
        id: a.id,
        platform: a.providerIdentifier,
        name: a.name,
        username: a.internalId,
        connected: !a.tokenExpired,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: { accounts: output },
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${String(err)}. Check POSTIZ_API_URL and POSTIZ_API_KEY.` }],
      };
    }
  },
);

// ── Tool: schedule_post ───────────────────────────────────────────────────

const SchedulePostSchema = z.object({
  platform: z.enum(["instagram", "facebook"])
    .describe("Target platform"),
  account_id: z.string()
    .describe("Postiz account ID (from postiz_list_accounts)"),
  copy: z.string().min(1).max(2200)
    .describe("Full post text to publish"),
  hashtags: z.array(z.string()).max(30).default([])
    .describe("Hashtags to append (without the # symbol)"),
  scheduled_for: z.string()
    .describe("ISO 8601 datetime with timezone e.g. '2025-08-15T09:00:00+08:00'"),
  image_url: z.string().url().optional()
    .describe("URL of image to attach (optional)"),
});

server.registerTool(
  "postiz_schedule_post",
  {
    title: "Schedule a Social Media Post",
    description: `Schedule a post to Instagram or Facebook via Postiz.
Returns the Postiz post ID for tracking status.

NOTE: Postiz queues the post as a DRAFT by default — it will publish at the scheduled time
only when Postiz is properly connected to the social account.

Args:
  - platform: 'instagram' or 'facebook'
  - account_id: from postiz_list_accounts
  - copy: full post text
  - hashtags: list of tags without # (will be appended to copy)
  - scheduled_for: ISO datetime with AWST timezone (+08:00)
  - image_url: optional image URL`,
    inputSchema: SchedulePostSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  async (params) => {
    try {
      const hashtagStr = params.hashtags.map((t) => `#${t.replace(/^#/, "")}`).join(" ");
      const fullContent = hashtagStr ? `${params.copy}\n\n${hashtagStr}` : params.copy;

      const body: Record<string, unknown> = {
        type: "post",
        date: params.scheduled_for,
        value: [{
          content: fullContent,
          id: params.account_id,
          ...(params.image_url ? { image: [{ path: params.image_url }] } : {}),
        }],
      };

      const result = await postizRequest<{ id: string; state: string }>("POST", "/api/posts", body);

      const output = {
        success: true,
        postizPostId: result.id,
        platform: params.platform,
        scheduledFor: params.scheduled_for,
        status: result.state ?? "QUEUE",
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error scheduling post: ${String(err)}` }],
      };
    }
  },
);

// ── Tool: get_post_status ─────────────────────────────────────────────────

server.registerTool(
  "postiz_get_post_status",
  {
    title: "Get Scheduled Post Status",
    description: "Check the current status of a scheduled post in Postiz (QUEUE, PUBLISHED, ERROR, etc).",
    inputSchema: {
      postiz_post_id: z.string().describe("The Postiz post ID"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ postiz_post_id }) => {
    try {
      const post = await postizRequest<{
        id: string; state: string; publishDate: string; publishedAt?: string; errorMessage?: string;
      }>("GET", `/api/posts/${postiz_post_id}`);

      const output = {
        id: post.id,
        status: post.state,
        scheduledFor: post.publishDate,
        publishedAt: post.publishedAt,
        error: post.errorMessage,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }] };
    }
  },
);

// ── Tool: cancel_post ─────────────────────────────────────────────────────

server.registerTool(
  "postiz_cancel_post",
  {
    title: "Cancel a Scheduled Post",
    description: "Delete/cancel a post from the Postiz queue before it publishes.",
    inputSchema: {
      postiz_post_id: z.string().describe("The Postiz post ID to cancel"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  async ({ postiz_post_id }) => {
    try {
      await postizRequest("DELETE", `/api/posts/${postiz_post_id}`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true, cancelled: postiz_post_id }) }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }] };
    }
  },
);

// ─── Start server ─────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
