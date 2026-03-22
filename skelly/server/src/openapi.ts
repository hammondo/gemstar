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

const AuthUser = registry.register(
    'AuthUser',
    z.object({ id: z.string(), name: z.string(), email: z.string().email() }).openapi('AuthUser'),
);

const ServiceInfo = registry.register(
    'ServiceInfo',
    z.object({ id: z.string(), name: z.string(), category: z.string() }).openapi('ServiceInfo'),
);

const BlogSync = registry.register(
    'BlogSync',
    z
        .object({
            attempted: z.boolean(),
            synced: z.boolean(),
            reason: z.string().optional(),
            documentId: z.string().optional(),
            slug: z.string().optional(),
        })
        .openapi('BlogSync'),
);

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

// ─── Auth ────────────────────────────────────────────────────────────────────

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
                    schema: z.object({ ok: z.literal(true), user: AuthUser }),
                },
            },
        },
        401: { description: 'Not authenticated', content: { 'application/json': { schema: ErrorResponse } } },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/auth/logout',
    tags: ['Auth'],
    summary: 'Destroy session and log out',
    responses: {
        200: {
            description: 'Session destroyed',
            content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
        },
    },
});

// ─── Campaigns ───────────────────────────────────────────────────────────────

registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/campaigns',
    tags: ['Campaigns'],
    summary: 'List campaigns, optionally filtered by status',
    request: {
        query: z.object({ status: CampaignStatus.optional() }),
    },
    responses: {
        200: {
            description: 'Array of campaigns',
            content: { 'application/json': { schema: z.object({ ok: z.literal(true), campaigns: z.array(Campaign) }) } },
        },
        401: { description: 'Not authenticated', content: { 'application/json': { schema: ErrorResponse } } },
    },
});

registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/campaigns/{id}',
    tags: ['Campaigns'],
    summary: 'Get a single campaign by ID',
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: {
            description: 'Campaign detail',
            content: { 'application/json': { schema: z.object({ ok: z.literal(true), campaign: Campaign }) } },
        },
        404: { description: 'Not found', content: { 'application/json': { schema: ErrorResponse } } },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/campaigns/{id}/approve',
    tags: ['Campaigns'],
    summary: 'Approve a campaign and trigger scheduling',
    request: {
        params: z.object({ id: z.string() }),
        body: {
            content: {
                'application/json': { schema: z.object({ notes: z.string().optional() }) },
            },
        },
    },
    responses: {
        200: {
            description: 'Campaign approved',
            content: { 'application/json': { schema: z.object({ ok: z.literal(true), campaign: Campaign }) } },
        },
        404: { description: 'Not found', content: { 'application/json': { schema: ErrorResponse } } },
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
                'application/json': { schema: z.object({ reason: z.string().optional() }) },
            },
        },
    },
    responses: {
        200: {
            description: 'Campaign rejected',
            content: { 'application/json': { schema: z.object({ ok: z.literal(true), campaign: Campaign }) } },
        },
        404: { description: 'Not found', content: { 'application/json': { schema: ErrorResponse } } },
    },
});

// ─── Posts ───────────────────────────────────────────────────────────────────

registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/posts/{id}',
    tags: ['Posts'],
    summary: 'Get a single post by ID',
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: {
            description: 'Post detail',
            content: { 'application/json': { schema: z.object({ ok: z.literal(true), post: SocialPost }) } },
        },
        404: { description: 'Not found', content: { 'application/json': { schema: ErrorResponse } } },
    },
});

registry.registerPath({
    method: 'patch',
    path: '/api/bodyspace/posts/{id}',
    tags: ['Posts'],
    summary: 'Update post copy and optional scheduled time',
    request: {
        params: z.object({ id: z.string() }),
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        copy: z.string(),
                        scheduledFor: z.string().nullable().optional(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Updated post',
            content: { 'application/json': { schema: z.object({ ok: z.literal(true), post: SocialPost }) } },
        },
        404: { description: 'Not found', content: { 'application/json': { schema: ErrorResponse } } },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/posts/{id}/approve',
    tags: ['Posts'],
    summary: 'Approve a post and trigger blog sync',
    request: {
        params: z.object({ id: z.string() }),
        body: {
            content: {
                'application/json': { schema: z.object({ copy: z.string().optional() }) },
            },
        },
    },
    responses: {
        200: {
            description: 'Post approved',
            content: {
                'application/json': {
                    schema: z.object({
                        ok: z.literal(true),
                        campaignId: z.string().nullable(),
                        blogSync: BlogSync,
                    }),
                },
            },
        },
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
                'application/json': { schema: z.object({ reason: z.string().optional() }) },
            },
        },
    },
    responses: {
        200: {
            description: 'Post rejected',
            content: {
                'application/json': {
                    schema: z.object({ ok: z.literal(true), campaignId: z.string().nullable() }),
                },
            },
        },
    },
});

// ─── Image management ────────────────────────────────────────────────────────

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/posts/{id}/image',
    tags: ['Posts'],
    summary: 'Set post image URL manually',
    request: {
        params: z.object({ id: z.string() }),
        body: {
            content: {
                'application/json': { schema: z.object({ imageUrl: z.string().url() }) },
            },
        },
    },
    responses: {
        200: {
            description: 'Image URL set',
            content: {
                'application/json': {
                    schema: z.object({
                        ok: z.literal(true),
                        postId: z.string(),
                        imageUrl: z.string(),
                        imageStatus: z.literal('draft'),
                    }),
                },
            },
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/posts/{id}/image/upload',
    tags: ['Posts'],
    summary: 'Upload an image file for a post (owner upload, bypasses AI)',
    request: {
        params: z.object({ id: z.string() }),
        body: {
            content: {
                'multipart/form-data': {
                    schema: z.object({ imageFile: z.any().openapi({ type: 'string', format: 'binary' }) }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Image uploaded, post updated',
            content: { 'application/json': { schema: z.object({ ok: z.literal(true), post: SocialPost }) } },
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/posts/{id}/image/approve',
    tags: ['Posts'],
    summary: 'Approve the current image draft',
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: {
            description: 'Image approved',
            content: {
                'application/json': {
                    schema: z.object({ ok: z.literal(true), post: SocialPost, blogSync: BlogSync }),
                },
            },
        },
        404: { description: 'Not found', content: { 'application/json': { schema: ErrorResponse } } },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/posts/{id}/image/regenerate',
    tags: ['Posts'],
    summary: 'Regenerate the AI image for a post, with optional feedback and reference image',
    request: {
        params: z.object({ id: z.string() }),
        body: {
            content: {
                'multipart/form-data': {
                    schema: z.object({
                        campaignId: z.string(),
                        feedback: z.string().optional(),
                        referenceImageUrl: z.string().optional(),
                        referenceImageFile: z.any().optional().openapi({ type: 'string', format: 'binary' }),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Image regenerated',
            content: {
                'application/json': {
                    schema: z.object({
                        ok: z.literal(true),
                        postId: z.string(),
                        imageUrl: z.string(),
                        imageStatus: z.literal('draft'),
                        feedbackApplied: z.boolean(),
                        referenceApplied: z.boolean(),
                    }),
                },
            },
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/posts/{id}/blog/sync',
    tags: ['Posts'],
    summary: 'Manually sync a post to the Sanity blog (retry)',
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: {
            description: 'Sync attempted',
            content: {
                'application/json': {
                    schema: z.object({ ok: z.literal(true), postId: z.string(), blogSync: BlogSync }),
                },
            },
        },
    },
});

// ─── Trends ──────────────────────────────────────────────────────────────────

registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/trends/latest',
    tags: ['Trends'],
    summary: 'Get the latest trends brief',
    responses: {
        200: {
            description: 'Latest trends brief, or null if none exists',
            content: {
                'application/json': {
                    schema: z.object({ ok: z.literal(true), brief: TrendsBrief.nullable() }),
                },
            },
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
                'application/json': {
                    schema: z.object({
                        competitorSummary: z.string(),
                        trendSignals: z.string(),
                        seasonalFactors: z.string(),
                        recommendedFocus: z.string(),
                        opportunities: z.string(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Updated trends brief',
            content: {
                'application/json': {
                    schema: z.object({ ok: z.literal(true), brief: TrendsBrief }),
                },
            },
        },
    },
});

// ─── Signals ─────────────────────────────────────────────────────────────────

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
                    schema: z.object({ ok: z.literal(true), signals: z.record(ServiceAvailability) }),
                },
            },
        },
    },
});

// ─── Status ──────────────────────────────────────────────────────────────────

registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/status',
    tags: ['System'],
    summary: 'Get BodySpace system status and campaign counts',
    responses: {
        200: {
            description: 'Status overview',
            content: {
                'application/json': {
                    schema: z.object({
                        ok: z.literal(true),
                        timezone: z.string().optional(),
                        schedules: z
                            .object({
                                freshaWatcher: z.string(),
                                monitor: z.string(),
                                campaignPlanner: z.string(),
                            })
                            .optional(),
                        counts: z.object({
                            pendingReviewCampaigns: z.number().int(),
                            approvedCampaigns: z.number().int(),
                            scheduledCampaigns: z.number().int(),
                            scheduledPosts: z.number().int(),
                        }),
                    }),
                },
            },
        },
    },
});

// ─── Services ────────────────────────────────────────────────────────────────

registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/services',
    tags: ['System'],
    summary: 'List all configured services',
    responses: {
        200: {
            description: 'Service list',
            content: {
                'application/json': {
                    schema: z.object({ ok: z.literal(true), services: z.array(ServiceInfo) }),
                },
            },
        },
    },
});

// ─── Analytics ───────────────────────────────────────────────────────────────

registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/analytics/meta',
    tags: ['Analytics'],
    summary: 'Get Meta (Instagram/Facebook) analytics',
    responses: {
        200: {
            description: 'Analytics data, or unconfigured indicator',
            content: {
                'application/json': {
                    schema: z.union([
                        z.object({ ok: z.literal(true), configured: z.literal(false) }),
                        z.object({
                            ok: z.literal(true),
                            configured: z.literal(true),
                            fetchedAt: z.string(),
                            instagram: z
                                .object({
                                    account: z.object({
                                        username: z.string(),
                                        followersCount: z.number().int(),
                                        mediaCount: z.number().int(),
                                    }),
                                    recentPosts: z.array(
                                        z.object({
                                            id: z.string(),
                                            caption: z.string(),
                                            mediaType: z.enum(['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM', 'REEL']),
                                            timestamp: z.string(),
                                            permalink: z.string(),
                                            likeCount: z.number().int(),
                                            commentsCount: z.number().int(),
                                            views: z.number().int(),
                                            reach: z.number().int(),
                                            saved: z.number().int(),
                                            shares: z.number().int(),
                                            totalInteractions: z.number().int(),
                                        }),
                                    ),
                                })
                                .optional(),
                            facebook: z
                                .object({
                                    page: z.object({
                                        name: z.string(),
                                        fanCount: z.number().int(),
                                        series: z.array(z.record(z.union([z.string(), z.number()]))),
                                        metrics: z.array(z.string()),
                                    }),
                                    recentPosts: z.array(
                                        z.object({
                                            id: z.string(),
                                            message: z.string(),
                                            createdTime: z.string(),
                                        }),
                                    ),
                                })
                                .optional(),
                        }),
                    ]),
                },
            },
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/analytics/meta/refresh',
    tags: ['Analytics'],
    summary: 'Clear the Meta analytics cache',
    responses: {
        200: {
            description: 'Cache cleared',
            content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
        },
    },
});

// ─── Settings ────────────────────────────────────────────────────────────────

registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/settings/monitor-terms',
    tags: ['Settings'],
    summary: 'Get monitor search terms',
    responses: {
        200: {
            description: 'Current search terms',
            content: {
                'application/json': {
                    schema: z.object({ ok: z.literal(true), terms: z.array(z.string()) }),
                },
            },
        },
    },
});

registry.registerPath({
    method: 'put',
    path: '/api/bodyspace/settings/monitor-terms',
    tags: ['Settings'],
    summary: 'Save monitor search terms',
    request: {
        body: {
            content: { 'application/json': { schema: z.object({ terms: z.array(z.string()) }) } },
        },
    },
    responses: {
        200: {
            description: 'Saved terms',
            content: {
                'application/json': {
                    schema: z.object({ ok: z.literal(true), terms: z.array(z.string()) }),
                },
            },
        },
    },
});

registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/settings/campaign-services',
    tags: ['Settings'],
    summary: 'Get selected campaign service IDs',
    responses: {
        200: {
            description: 'Selected service IDs',
            content: {
                'application/json': {
                    schema: z.object({ ok: z.literal(true), services: z.array(z.string()) }),
                },
            },
        },
    },
});

registry.registerPath({
    method: 'put',
    path: '/api/bodyspace/settings/campaign-services',
    tags: ['Settings'],
    summary: 'Save selected campaign service IDs',
    request: {
        body: {
            content: { 'application/json': { schema: z.object({ services: z.array(z.string()) }) } },
        },
    },
    responses: {
        200: {
            description: 'Saved service IDs',
            content: {
                'application/json': {
                    schema: z.object({ ok: z.literal(true), services: z.array(z.string()) }),
                },
            },
        },
    },
});

// ─── Wizard ──────────────────────────────────────────────────────────────────

registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/wizard/monitor-prompt',
    tags: ['Wizard'],
    summary: 'Get the current monitor agent prompt',
    responses: {
        200: {
            description: 'Prompt text',
            content: {
                'application/json': { schema: z.object({ ok: z.literal(true), prompt: z.string() }) },
            },
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/wizard/monitor/stream',
    tags: ['Wizard'],
    summary: 'Run the monitor agent with optional custom terms, streamed as SSE',
    request: {
        body: {
            content: {
                'application/json': { schema: z.object({ terms: z.array(z.string()).optional() }) },
            },
        },
    },
    responses: {
        200: { description: 'SSE stream of progress events (text/event-stream)' },
    },
});

registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/wizard/campaign-prompt',
    tags: ['Wizard'],
    summary: 'Get the campaign planner prompt',
    responses: {
        200: {
            description: 'Prompt text',
            content: {
                'application/json': { schema: z.object({ ok: z.literal(true), prompt: z.string() }) },
            },
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/wizard/campaign',
    tags: ['Wizard'],
    summary: 'Run the campaign wizard to generate a new campaign',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        ownerBrief: z.string().optional(),
                        selectedServices: z.array(z.string()).optional(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Generated campaign',
            content: {
                'application/json': {
                    schema: z.object({ ok: z.literal(true), campaign: Campaign }),
                },
            },
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/wizard/suggest-terms',
    tags: ['Wizard'],
    summary: 'AI-powered search term suggestions for the monitor wizard',
    responses: {
        200: {
            description: 'Suggested search terms',
            content: {
                'application/json': {
                    schema: z.object({ ok: z.literal(true), terms: z.array(z.string()) }),
                },
            },
        },
    },
});

// ─── Agent triggers ──────────────────────────────────────────────────────────

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/run/fresha',
    tags: ['Agents'],
    summary: 'Manually trigger the Fresha availability watcher',
    responses: {
        200: {
            description: 'Agent completed',
            content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
        },
    },
});

registry.registerPath({
    method: 'get',
    path: '/api/bodyspace/run/monitor/stream',
    tags: ['Agents'],
    summary: 'Run the market monitor agent, streamed as SSE',
    responses: {
        200: { description: 'SSE stream of progress events (text/event-stream)' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/run/campaign',
    tags: ['Agents'],
    summary: 'Manually trigger the campaign planner agent',
    request: {
        body: {
            content: {
                'application/json': { schema: z.object({ ownerBrief: z.string().optional() }) },
            },
        },
    },
    responses: {
        200: {
            description: 'Agent completed',
            content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/run/all',
    tags: ['Agents'],
    summary: 'Manually trigger all agents in sequence',
    request: {
        body: {
            content: {
                'application/json': { schema: z.object({ ownerBrief: z.string().optional() }) },
            },
        },
    },
    responses: {
        200: {
            description: 'All agents completed',
            content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/run/image-generator',
    tags: ['Agents'],
    summary: 'Manually trigger image generation for a campaign',
    request: {
        body: {
            content: {
                'application/json': { schema: z.object({ campaignId: z.string() }) },
            },
        },
    },
    responses: {
        200: {
            description: 'Image generation started',
            content: {
                'application/json': {
                    schema: z.object({
                        ok: z.literal(true),
                        message: z.string(),
                        campaignId: z.string(),
                    }),
                },
            },
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/schedule',
    tags: ['Agents'],
    summary: 'Manually trigger post scheduler',
    request: {
        body: {
            content: {
                'application/json': { schema: z.object({ campaignId: z.string().optional() }) },
            },
        },
    },
    responses: {
        200: {
            description: 'Scheduling completed',
            content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
        },
    },
});

// ─── Fresha import ───────────────────────────────────────────────────────────

registry.registerPath({
    method: 'post',
    path: '/api/bodyspace/fresha/import',
    tags: ['Agents'],
    summary: 'Import a Fresha CSV export and run the availability watcher',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        csvContent: z.string(),
                        filename: z.string().optional(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'CSV imported and signals refreshed',
            content: {
                'application/json': {
                    schema: z.object({
                        ok: z.literal(true),
                        filename: z.string(),
                        signals: z.unknown(),
                    }),
                },
            },
        },
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
            { name: 'System', description: 'Health, status and diagnostics' },
            { name: 'Auth', description: 'Microsoft Entra ID authentication' },
            { name: 'Campaigns', description: 'Campaign lifecycle management' },
            { name: 'Posts', description: 'Social post management and approvals' },
            { name: 'Trends', description: 'Market trends briefs' },
            { name: 'Signals', description: 'Fresha booking availability signals' },
            { name: 'Analytics', description: 'Meta (Instagram/Facebook) analytics' },
            { name: 'Settings', description: 'Persistent settings store' },
            { name: 'Wizard', description: 'Guided campaign and monitor setup flows' },
            { name: 'Agents', description: 'Manual agent triggers' },
        ],
    });
}
