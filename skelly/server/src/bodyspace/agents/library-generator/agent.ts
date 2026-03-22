// src/agents/library-generator/agent.ts
// Generates a reusable library of social posts per service.
// Posts are stored without scheduled dates — the owner picks and schedules on demand.

import Anthropic from '@anthropic-ai/sdk';
import { getBrandVoice, getServiceById, settings } from '../../config.js';
import { saveLibraryPosts } from '../../db.js';
import type {
    ContentPillar,
    GeneratedLibraryPost,
    Platform,
    PostType,
    SocialPost,
    VariantTag,
} from '../../types.js';
import { getAgentLogger } from '../../utils/logger.js';

interface RawLibraryPost {
    platform: Platform;
    postType: PostType;
    contentPillar: ContentPillar;
    variantTag: VariantTag;
    copy: string;
    imageDirection: string;
    hashtags: string[];
    callToAction: string;
}

export class LibraryGeneratorAgent {
    private client: Anthropic | null;
    private brand = getBrandVoice();
    private readonly log = getAgentLogger('LibraryGenerator');

    constructor() {
        if (settings.mockAnthropic) {
            this.log.info('Running in mock mode');
            this.client = null;
        } else {
            if (!settings.anthropicApiKey) {
                throw new Error('ANTHROPIC_API_KEY is required to run LibraryGeneratorAgent');
            }
            this.client = new Anthropic({ apiKey: settings.anthropicApiKey });
        }
    }

    async run(serviceIds: string[], postsPerService = 6): Promise<SocialPost[]> {
        const allSaved: SocialPost[] = [];

        for (const serviceId of serviceIds) {
            const service = getServiceById(serviceId);
            if (!service) {
                this.log.warn({ serviceId }, 'Service not found — skipping');
                continue;
            }

            this.log.info({ serviceId, serviceName: service.name }, 'Generating library posts');

            const raw = settings.mockAnthropic
                ? this.getMockPosts(serviceId, postsPerService)
                : await this.generate(serviceId, postsPerService);

            const toSave: GeneratedLibraryPost[] = raw.map((p) => ({
                serviceId,
                platform: p.platform,
                postType: p.postType,
                contentPillar: p.contentPillar,
                variantTag: p.variantTag,
                copy: p.copy,
                imageDirection: p.imageDirection,
                hashtags: p.hashtags,
                callToAction: p.callToAction,
            }));

            const saved = saveLibraryPosts(toSave);
            allSaved.push(...saved);

            this.log.info({ serviceId, count: saved.length }, 'Library posts saved');
        }

        return allSaved;
    }

    private buildPrompt(serviceId: string, count: number): string {
        const b = this.brand;
        const service = getServiceById(serviceId)!;

        return `
BRAND VOICE:
- Tone: ${b.brandVoice.tone.join('; ')}
- Avoid: ${b.brandVoice.avoid.join('; ')}
- Style: Australian spelling, warm and personal, never salesy

AUDIENCE:
- Primary: ${b.audience.primary.join(', ')}
- Pain points: ${b.audience.painPoints.join(', ')}

SERVICE:
- Name: ${service.name}
- Category: ${service.category}
- Key benefits: ${service.keyBenefits.join(', ')}
- Target audience: ${service.targetAudience.join(', ')}
${service.contentNote ? `- Content note: ${service.contentNote}` : ''}

BOOKING URL: ${b.studio.bookingUrl}
INSTAGRAM: ${b.studio.instagram}

Generate ${count} standalone social media posts for the "${service.name}" service.
These posts will be stored in a content library and scheduled individually by the owner as needed — they have no fixed date.

REQUIREMENTS:
- Mix of platforms: mostly Instagram feed, some Facebook, optionally Instagram story
- Content pillar mix: education, promotion, community, social_proof, seasonal (vary it)
- Variant tag: assign one of promotional, educational, seasonal, community to each post
- Each post: full publishable copy (no placeholders or [dates]), hashtags, image direction
- Instagram: max 10 hashtags. Facebook: max 3 hashtags
- Promotion posts must include the booking URL
- Write in a warm, grounded Australian voice — reads like a real person, not AI
- Posts should be timeless (no references to specific upcoming dates or "this week")

Return ONLY valid JSON — an array of objects:
[
  {
    "platform": "instagram",
    "postType": "feed",
    "contentPillar": "education",
    "variantTag": "educational",
    "copy": "Full post text exactly as published. No placeholders.",
    "imageDirection": "Specific visual brief for photographer/designer",
    "hashtags": ["hashtag1", "hashtag2"],
    "callToAction": "Book online → URL or short CTA"
  }
]
`;
    }

    private async generate(serviceId: string, count: number): Promise<RawLibraryPost[]> {
        const prompt = this.buildPrompt(serviceId, count);
        const startedAt = Date.now();

        this.log.info(
            {
                event: 'outbound.request',
                system: 'anthropic',
                operation: 'messages.create',
                model: 'claude-sonnet-4-20250514',
                serviceId,
                promptBytes: Buffer.byteLength(prompt),
            },
            'Outbound request started'
        );

        const response = await this.client!.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 6000,
            system: `You are the marketing strategist and copywriter for BodySpace Recovery Studio,
a warm holistic wellness studio in Jandakot, Perth, Western Australia.
Write post copy that sounds genuinely human — warm, grounded, and personal.
Output ONLY valid JSON, no preamble, no markdown fences.`,
            messages: [{ role: 'user', content: prompt }],
        });

        this.log.info(
            {
                event: 'outbound.response',
                system: 'anthropic',
                operation: 'messages.create',
                durationMs: Date.now() - startedAt,
                stopReason: response.stop_reason,
            },
            'Outbound response received'
        );

        let text = '';
        for (const block of response.content) {
            if (block.type === 'text') text += block.text;
        }

        let clean = text.trim();
        if (clean.startsWith('```')) {
            const parts = clean.split('```');
            clean = parts[1] ?? '';
            if (clean.startsWith('json')) clean = clean.slice(4);
        }

        return JSON.parse(clean) as RawLibraryPost[];
    }

    private getMockPosts(serviceId: string, count: number): RawLibraryPost[] {
        const service = getServiceById(serviceId);
        const name = service?.name ?? serviceId;

        const templates: RawLibraryPost[] = [
            {
                platform: 'instagram',
                postType: 'feed',
                contentPillar: 'education',
                variantTag: 'educational',
                copy: `[MOCK] Did you know ${name} can help reduce inflammation and support recovery? Whether you're an athlete, desk worker, or just someone who deserves a reset — this treatment was made for you. ✨\n\nBook your session → ${this.brand.studio.bookingUrl}`,
                imageDirection: `Warm, inviting treatment room shot featuring ${name} service setup. Soft natural lighting, earthy tones.`,
                hashtags: ['perthwellness', 'bodyspace', 'recovery', 'selfcare', 'jandakot'],
                callToAction: `Book online → ${this.brand.studio.bookingUrl}`,
            },
            {
                platform: 'instagram',
                postType: 'feed',
                contentPillar: 'promotion',
                variantTag: 'promotional',
                copy: `[MOCK] Spots are available for ${name} this week. If you've been putting off some proper self-care, consider this your sign. 🙏\n\nBook now → ${this.brand.studio.bookingUrl}`,
                imageDirection: `Clean, welcoming shot of ${name} treatment area. Warm light, fresh linen, inviting atmosphere.`,
                hashtags: ['perthwellness', 'selfcare', 'bodyspace', 'jandakot', 'cockburn'],
                callToAction: `Book now → ${this.brand.studio.bookingUrl}`,
            },
            {
                platform: 'facebook',
                postType: 'feed',
                contentPillar: 'community',
                variantTag: 'community',
                copy: `[MOCK] We love seeing our clients walk out feeling lighter after their ${name} session. It genuinely makes our day. If you've been thinking about trying it — we'd love to welcome you. ❤️`,
                imageDirection: `Candid reception or relaxation area photo. Warm lighting, client-friendly vibe without showing identifiable faces.`,
                hashtags: ['bodyspace', 'community', 'wellness'],
                callToAction: 'Come visit us',
            },
            {
                platform: 'instagram',
                postType: 'feed',
                contentPillar: 'social_proof',
                variantTag: 'community',
                copy: `[MOCK] ⭐ "The ${name} session was exactly what I needed. The studio is so peaceful and the team really listens." — Happy client\n\nThank you — reviews like this mean everything to us.`,
                imageDirection: `Testimonial-style graphic or cosy studio corner shot. Brand colours, warm and trustworthy feel.`,
                hashtags: ['perthreview', 'testimonial', 'bodyspace', 'wellness', 'jandakot'],
                callToAction: 'Read more reviews',
            },
            {
                platform: 'instagram',
                postType: 'feed',
                contentPillar: 'seasonal',
                variantTag: 'seasonal',
                copy: `[MOCK] As the season changes, it's the perfect time to give your body some extra care. A ${name} session helps you reset and feel grounded no matter what's going on. 🍂`,
                imageDirection: `Seasonal atmosphere shot — soft tones matching current season. Treatment props or cosy studio details.`,
                hashtags: ['perthwellness', 'seasonal', 'selfcare', 'bodyspace', 'reset'],
                callToAction: `Book a session → ${this.brand.studio.bookingUrl}`,
            },
            {
                platform: 'instagram',
                postType: 'story',
                contentPillar: 'promotion',
                variantTag: 'promotional',
                copy: `[MOCK] Reminder: ${name} is available to book right now 👉 Tap the link to grab your spot.`,
                imageDirection: `Vertical story format. Bold, simple composition. Service setup or treatment room. Text overlay space at top and bottom.`,
                hashtags: ['bodyspace', 'perthwellness'],
                callToAction: `Tap to book → ${this.brand.studio.bookingUrl}`,
            },
        ];

        return templates.slice(0, count);
    }
}
