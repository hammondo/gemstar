import { extendZodWithOpenApi, OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// ─── Reusable schemas ────────────────────────────────────────────────────────

const AvailabilitySignal = registry.register(
    'AvailabilitySignal',
    z.enum(['push', 'hold', 'pause']).openapi({ description: 'Booking availability signal' }),
);

const CampaignStatus = registry.register(
    'CampaignStatus',
    z
        .enum(['draft', 'pending_review', 'approved', 'rejected', 'scheduled', 'published'])
        .openapi({ description: 'Current lifecycle status of a campaign' }),
);

const PostStatus = registry.register(
    'PostStatus',
    z
        .enum(['draft', 'pending_review', 'approved', 'rejected', 'scheduled', 'published'])
        .openapi({ description: 'Current lifecycle status of a social post' }),
);

const ImageStatus = registry.register(
    'ImageStatus',
    z.enum(['needed', 'generating', 'draft', 'approved']).openapi({ description: 'Image generation status' }),
);

const Platform = registry.register(
    'Platform',
    z.enum(['instagram', 'facebook']).openapi({ description: 'Social media platform' }),
);

const PostType = registry.register(
    'PostType',
    z.enum(['feed', 'story', 'reel']).openapi({ description: 'Type of social media post' }),
);

const ContentPillar = registry.register(
    'ContentPillar',
    z
        .enum(['education', 'promotion', 'community', 'social_proof', 'seasonal'])
        .openapi({ description: 'Content strategy pillar' }),
);

const SocialPost = registry.register(
    'SocialPost',
    z
        .object({
            id: z.string().openapi({ example: 'post_abc123' }),
            campaignId: z.string().openapi({ example: 'cmp_xyz789' }),
            platform: Platform,
            postType: PostType,
            contentPillar: ContentPillar,
            copy: z.string().openapi({ description: 'Post body text' }),
            ownerEdit: z.string().optional().openapi({ description: 'Owner override for post copy' }),
            imageDirection: z.string().openapi({ description: 'Instructions for image generation' }),
            hashtags: z.array(z.string()),
            callToAction: z.string(),
            scheduledFor: z.string().optional().openapi({ example: '2025-06-01T09:00:00+08:00' }),
            status: PostStatus,
            imageUrl: z.string().optional().openapi({ description: 'Publicly accessible URL of the generated image' }),
            imageStatus: ImageStatus.optional(),
            rejectionReason: z.string().optional(),
            createdAt: z.string().openapi({ example: '2025-05-20T12:00:00.000Z' }),
            publishedAt: z.string().optional(),
        })
        .openapi('SocialPost'),
);

const Campaign = registry.register(
    'Campaign',
    z
        .object({
            id: z.string().openapi({ example: 'cmp_xyz789' }),
            name: z.string().openapi({ example: 'Winter Wellness Push' }),
            theme: z.string(),
            description: z.string(),
            targetServices: z.array(z.string()),
            durationWeeks: z.number().int().positive(),
            status: CampaignStatus,
            freshaSignals: z.record(
                z.object({
                    signal: AvailabilitySignal,
                    slots: z.number().int(),
                }),
            ),
            trendsBriefId: z.string().optional(),
            ownerNotes: z.string().optional(),
            createdAt: z.string(),
            approvedAt: z.string().optional(),
            posts: z.array(SocialPost),
        })
        .openapi('Campaign'),
);

const TrendsBrief = registry.register(
    'TrendsBrief',
    z
        .object({
            id: z.string(),
            weekOf: z.string().openapi({ example: '2025-06-02' }),
            competitorSummary: z.string(),
            trendSignals: z.string(),
            seasonalFactors: z.string(),
            recommendedFocus: z.string(),
            opportunities: z.string(),
            sources: z.array(z.string()),
            confidence: z.enum(['high', 'medium', 'low']),
            createdAt: z.string(),
        })
        .openapi('TrendsBrief'),
);

const ServiceAvailability = registry.register(
    'ServiceAvailability',
    z
        .object({
            serviceId: z.string(),
            serviceName: z.string(),
            availableSlots: z.number().int(),
            totalSlots: z.number().int().optional(),
            bookedSlots: z.number().int().optional(),
            signal: AvailabilitySignal,
            pushThreshold: z.number().int(),
            pauseThreshold: z.number().int(),
            recordedAt: z.string(),
        })
        .openapi('ServiceAvailability'),
);

// ─── Standard response wrapper ───────────────────────────────────────────────

function ok<T extends z.ZodTypeAny>(data: T) {
    return z.object({ ok: z.literal(true), data });
}

const ErrorResponse = z.object({ ok: z.literal(false), error: z.string() }).openapi('ErrorResponse');

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health
registry.registerPath({
    method: 'get',
    path: '/api/health',
    tags: ['System'],
    summary: 'Health check',
    responses: {
        200: {
            description: 'Server is running',
            content: {
                'application/json': {
                    schema: z.object({
                        status: z.literal('ok'),
                        service: z.string(),
                        timestamp: z.string(),
                    }),
                },
            },
        },
    },
});

// Auth
registry.registerPath({
    method: 'get',
    path: '/api/auth/me',
    tags: ['Auth'],
    summary: 'Get current authenticated user',
    responses: {
        200: {
            description: 'Current user session',
            content: {
                'application/json': {
                    schema: ok(
                        z.object({
                            displayName: z.string(),
                            email: z.string().email(),
                        }),
                    ),
                },
            },
        },
        401: { description: 'Not authenticated' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/auth/logout',
    tags: ['Auth'],
    summary: 'Destroy session and log out',
    responses: {
        200: { description: 'Session destroyed' },
    },
});

// Campaigns
registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/campaigns',
    tags: ['Campaigns'],
    summary: 'List all campaigns',
    responses: {
        200: {
            description: 'Array of campaigns across all statuses',
            content: { 'application/json': { schema: ok(z.array(Campaign)) } },
        },
        401: { description: 'Not authenticated', content: { 'application/json': { schema: ErrorResponse } } },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/campaigns',
    tags: ['Campaigns'],
    summary: 'Create a new campaign (from wizard output)',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({ campaign: Campaign }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Created campaign',
            content: { 'application/json': { schema: ok(Campaign) } },
        },
        401: { description: 'Not authenticated', content: { 'application/json': { schema: ErrorResponse } } },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/campaigns/{id}/approve',
    tags: ['Campaigns'],
    summary: 'Approve a campaign',
    request: {
        params: z.object({ id: z.string() }),
        body: {
            content: {
                'application/json': {
                    schema: z.object({ notes: z.string().optional() }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Campaign approved',
            content: { 'application/json': { schema: ok(Campaign) } },
        },
        404: { description: 'Campaign not found', content: { 'application/json': { schema: ErrorResponse } } },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/campaigns/{id}/reject',
    tags: ['Campaigns'],
    summary: 'Reject a campaign',
    request: {
        params: z.object({ id: z.string() }),
        body: {
            content: {
                'application/json': {
                    schema: z.object({ reason: z.string() }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Campaign rejected',
            content: { 'application/json': { schema: ok(Campaign) } },
        },
        404: { description: 'Campaign not found', content: { 'application/json': { schema: ErrorResponse } } },
    },
});

// Posts
registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/posts/{id}',
    tags: ['Posts'],
    summary: 'Get a single post by ID',
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: {
            description: 'Post detail',
            content: { 'application/json': { schema: ok(SocialPost) } },
        },
        404: { description: 'Post not found', content: { 'application/json': { schema: ErrorResponse } } },
    },
});

registry.registerPath({
    method: 'patch',
    path: '/api/bodyspace/posts/{id}',
    tags: ['Posts'],
    summary: 'Update post copy (owner edit)',
    request: {
        params: z.object({ id: z.string() }),
        body: {
            content: {
                'application/json': {
                    schema: z.object({ ownerEdit: z.string() }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Updated post',
            content: { 'application/json': { schema: ok(SocialPost) } },
        },
        404: { description: 'Post not found', content: { 'application/json': { schema: ErrorResponse } } },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/posts/{id}/approve',
    tags: ['Posts'],
    summary: 'Approve a post for scheduling',
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: {
            description: 'Post approved',
            content: { 'application/json': { schema: ok(SocialPost) } },
        },
        404: { description: 'Post not found', content: { 'application/json': { schema: ErrorResponse } } },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/posts/{id}/reject',
    tags: ['Posts'],
    summary: 'Reject a post',
    request: {
        params: z.object({ id: z.string() }),
        body: {
            content: {
                'application/json': {
                    schema: z.object({ reason: z.string() }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Post rejected',
            content: { 'application/json': { schema: ok(SocialPost) } },
        },
        404: { description: 'Post not found', content: { 'application/json': { schema: ErrorResponse } } },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/posts/{id}/image',
    tags: ['Posts'],
    summary: 'Upload an image for a post',
    request: {
        params: z.object({ id: z.string() }),
        body: {
            content: {
                'multipart/form-data': {
                    schema: z.object({ image: z.any().openapi({ type: 'string', format: 'binary' }) }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Image uploaded and post updated',
            content: { 'application/json': { schema: ok(SocialPost) } },
        },
    },
});

// Trends
registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/trends/latest',
    tags: ['Trends'],
    summary: 'Get the latest trends brief',
    responses: {
        200: {
            description: 'Latest trends brief, or null if none exists',
            content: { 'application/json': { schema: ok(TrendsBrief.nullable()) } },
        },
    },
});

registry.registerPath({
    method: 'patch',
    path: '/api/bodyspace/trends/{id}',
    tags: ['Trends'],
    summary: 'Update a trends brief',
    request: {
        params: z.object({ id: z.string() }),
        body: {
            content: {
                'application/json': { schema: TrendsBrief.partial() },
            },
        },
    },
    responses: {
        200: {
            description: 'Updated trends brief',
            content: { 'application/json': { schema: ok(TrendsBrief) } },
        },
    },
});

// Signals
registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/signals',
    tags: ['Signals'],
    summary: 'Get latest Fresha booking availability signals',
    responses: {
        200: {
            description: 'Map of service ID to availability data',
            content: {
                'application/json': {
                    schema: ok(z.record(ServiceAvailability)),
                },
            },
        },
    },
});

// Agent triggers
registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/run/fresha-watcher',
    tags: ['Agents'],
    summary: 'Manually trigger the Fresha availability watcher',
    responses: {
        200: { description: 'Agent run started (streaming SSE)' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/run/monitor',
    tags: ['Agents'],
    summary: 'Manually trigger the market monitor agent',
    responses: {
        200: { description: 'Agent run started (streaming SSE)' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/run/campaign-planner',
    tags: ['Agents'],
    summary: 'Manually trigger the campaign planner agent',
    responses: {
        200: { description: 'Agent run started (streaming SSE)' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/run/image-generator',
    tags: ['Agents'],
    summary: 'Manually trigger the image generator agent',
    responses: {
        200: { description: 'Agent run started (streaming SSE)' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/run/scheduler',
    tags: ['Agents'],
    summary: 'Manually trigger the post scheduler agent',
    responses: {
        200: { description: 'Agent run started (streaming SSE)' },
    },
});

// ─── Spec generator ──────────────────────────────────────────────────────────

export function buildOpenApiSpec() {
    const generator = new OpenApiGeneratorV31(registry.definitions);
    return generator.generateDocument({
        openapi: '3.1.0',
        info: {
            title: 'Gemstar / BodySpace API',
            version: '1.0.0',
            description:
                'API for the BodySpace Recovery Studio marketing automation platform. ' +
                'Protected routes under `/api/bodyspace` require an active Azure AD session.',
        },
        tags: [
            { name: 'System', description: 'Health and diagnostics' },
            { name: 'Auth', description: 'Microsoft Entra ID authentication' },
            { name: 'Campaigns', description: 'Campaign lifecycle management' },
            { name: 'Posts', description: 'Social post management and approvals' },
            { name: 'Trends', description: 'Market trends briefs' },
            { name: 'Signals', description: 'Fresha booking availability signals' },
            { name: 'Agents', description: 'Manual agent triggers' },
        ],
    });
}
