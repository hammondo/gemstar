// src/agents/campaign-planner/agent.ts
// Generates full campaign plans + social post drafts, using Fresha signals + trends brief.

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getBrandVoice, getServiceById, settings } from '../../config.js';
import { getLatestSignals, getLatestTrendsBrief, saveCampaign } from '../../db.js';
import type {
    AvailabilitySignals,
    Campaign,
    GeneratedCampaign,
    GeneratedPost,
    PostStatus,
    SocialPost,
    TrendsBrief,
} from '../../types.js';
import { addDays, format, nextMonday } from '../../utils/dates.js';
import { getAgentLogger } from '../../utils/logger.js';

export class CampaignPlannerAgent {
    private client: Anthropic | null;
    private brand = getBrandVoice();
    private readonly log = getAgentLogger('CampaignPlanner');

    constructor() {
        if (settings.mockAnthropic) {
            this.log.info('Running in mock mode');
            this.client = null;
        } else {
            if (!settings.anthropicApiKey) {
                throw new Error('ANTHROPIC_API_KEY is required to run CampaignPlannerAgent');
            }
            this.client = new Anthropic({ apiKey: settings.anthropicApiKey });
        }
    }

    /** Build the campaign prompt using current signals + trends brief, for wizard preview. */
    public async buildPromptForWizard(ownerBrief?: string): Promise<string> {
        const signals = await getLatestSignals();
        const brief = await getLatestTrendsBrief();
        const pushServices = Object.fromEntries(Object.entries(signals).filter(([, v]) => v.signal === 'push'));
        const pauseServices = Object.fromEntries(Object.entries(signals).filter(([, v]) => v.signal === 'pause'));
        return this.buildPrompt(pushServices, pauseServices, brief, ownerBrief);
    }

    async run(
        options: {
            availabilitySignals?: AvailabilitySignals;
            trendsBrief?: TrendsBrief | null;
            ownerBrief?: string;
            customPrompt?: string;
            selectedServices?: string[];
        } = {}
    ): Promise<Campaign> {
        const signals = options.availabilitySignals ?? await getLatestSignals();
        const brief = options.trendsBrief ?? await getLatestTrendsBrief();

        const pushServices = Object.fromEntries(Object.entries(signals).filter(([, v]) => v.signal === 'push'));
        const pauseServices = Object.fromEntries(Object.entries(signals).filter(([, v]) => v.signal === 'pause'));

        this.log.info(
            { pushCount: Object.keys(pushServices).length, pauseCount: Object.keys(pauseServices).length },
            'Computed service availability buckets'
        );

        const prompt = options.customPrompt ?? this.buildPrompt(pushServices, pauseServices, brief, options.ownerBrief, options.selectedServices);
        const generated = settings.mockAnthropic ? this.getMockCampaign() : await this.generate(prompt);
        const campaign = this.buildCampaignRecord(generated, signals, brief?.id);

        await saveCampaign(campaign);

        // Write to pending-review folder
        const dir = resolve(settings.dataDir, 'pending-review');
        mkdirSync(dir, { recursive: true });
        const filename = `campaign_${campaign.id.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.json`;
        writeFileSync(resolve(dir, filename), JSON.stringify(campaign, null, 2));

        this.log.info(
            { campaignId: campaign.id, campaignName: campaign.name, posts: campaign.posts.length },
            'Campaign created'
        );
        return campaign;
    }

    private buildPrompt(
        pushServices: AvailabilitySignals,
        pauseServices: AvailabilitySignals,
        brief: TrendsBrief | null,
        ownerBrief?: string,
        selectedServices?: string[]
    ): string {
        const b = this.brand;
        const today = new Date();
        const campaignEnd = addDays(today, 28);

        const pushList = selectedServices?.length
            ? selectedServices
                  .map((id) => {
                      const svc = getServiceById(id);
                      return `  - ${svc?.name ?? id}`;
                  })
                  .join('\n')
            : Object.values(pushServices).length
              ? Object.values(pushServices)
                    .map((v) => `  - ${v.serviceName} (${v.availableSlots} slots free)`)
                    .join('\n')
              : '  (none — all services have normal availability)';

        const pauseList = Object.values(pauseServices).length
            ? Object.values(pauseServices)
                  .map((v) => `  - ${v.serviceName} (${v.availableSlots} slots — nearly booked)`)
                  .join('\n')
            : '  (none)';

        const trendsContext = brief
            ? `
WEEKLY TRENDS BRIEF:
- Competitor activity: ${brief.competitorSummary}
- Trend signals: ${brief.trendSignals}
- Seasonal factors: ${brief.seasonalFactors}
- Recommended focus: ${brief.recommendedFocus}
- Opportunities: ${brief.opportunities}
`
            : '';

        const ownerContext = ownerBrief ? `\nOWNER'S REQUEST:\n${ownerBrief}\n` : '';

        // Build schedule: Mon/Wed/Fri for 4 weeks
        const scheduleDates = this.buildScheduleDates(today);

        return `
Today: ${format(today)}
Campaign period: ${format(today)} → ${format(campaignEnd)}

BRAND VOICE:
- Tone: ${b.brandVoice.tone.join('; ')}
- Avoid: ${b.brandVoice.avoid.join('; ')}
- Style: Australian spelling, warm and personal, never salesy

AUDIENCE:
- Primary: ${b.audience.primary.join(', ')}
- Secondary: ${b.audience.secondary.join(', ')}
- Pain points: ${b.audience.painPoints.join(', ')}

FRESHA BOOKING SIGNALS:
Services to PROMOTE HEAVILY (available slots):
${pushList}

Services to EXCLUDE (nearly/fully booked):
${pauseList}
${trendsContext}${ownerContext}
BOOKING URL: ${b.studio.bookingUrl}
GIFT CARDS: ${b.studio.giftCardUrl}
INSTAGRAM: ${b.studio.instagram}

SCHEDULED POST DATES (Mon/Wed/Fri):
${scheduleDates.map((d, i) => `  Post ${i + 1}: ${d.label} (${d.platform})`).join('\n')}

Generate a 4-week campaign plan for BodySpace Recovery Studio.

REQUIREMENTS:
- 12 posts total: 8 Instagram feed posts + 4 Facebook posts
- Spread across Mon/Wed/Fri using the dates listed above
- Content pillar mix: education ×3, promotion ×4, community ×2, social_proof ×1, seasonal ×2
- Do NOT promote any "pause" services
- Promotion posts must include the booking URL
- Each post: full publishable copy (no placeholders), hashtags, image direction
- Instagram: max 10 hashtags. Facebook: max 3 hashtags
- Write in a warm, grounded Australian voice — reads like a real person, not AI

Return ONLY valid JSON:
{
  "campaignName": "Short evocative name e.g. 'Autumn Reset'",
  "campaignTheme": "One-sentence central message",
  "campaignDescription": "2-3 sentence strategy overview",
  "targetServices": ["service_id_1", "service_id_2"],
  "durationWeeks": 4,
  "posts": [
    {
      "week": 1,
      "day": "Monday",
      "scheduledDate": "YYYY-MM-DD",
      "platform": "instagram",
      "postType": "feed",
      "contentPillar": "education",
      "copy": "Full post text exactly as published. Complete sentences. No placeholders.",
      "imageDirection": "Specific visual brief for photographer/designer",
      "hashtags": ["hashtag1", "hashtag2"],
      "callToAction": "Book online → [URL]",
      "serviceFocus": "service_id or null"
    }
  ]
}
`;
    }

    private buildScheduleDates(start: Date): Array<{ date: string; label: string; platform: string }> {
        const dates: Array<{ date: string; label: string; platform: string }> = [];
        const platforms = ['instagram', 'instagram', 'facebook']; // Mon=IG, Wed=IG, Fri=FB
        let current = nextMonday(start);

        for (let week = 0; week < 4; week++) {
            const mon = addDays(current, week * 7);
            const wed = addDays(mon, 2);
            const fri = addDays(mon, 4);

            dates.push({
                date: format(mon),
                label: `Week ${week + 1} Mon`,
                platform: platforms[0],
            });
            dates.push({
                date: format(wed),
                label: `Week ${week + 1} Wed`,
                platform: platforms[1],
            });
            dates.push({
                date: format(fri),
                label: `Week ${week + 1} Fri`,
                platform: platforms[2],
            });
        }

        return dates;
    }

    private async generate(prompt: string): Promise<GeneratedCampaign> {
        const startedAt = Date.now();
        this.log.info(
            {
                event: 'outbound.request',
                system: 'anthropic',
                operation: 'messages.create',
                model: 'claude-sonnet-4-20250514',
                promptBytes: Buffer.byteLength(prompt),
                prompt,
            },
            'Outbound request started'
        );

        let response: Anthropic.Message | undefined;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                response = await this.client!.messages.create({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 8000,
                    system: `You are the marketing strategist and copywriter for BodySpace Recovery Studio,
a warm holistic wellness studio in Jandakot, Perth, Western Australia.
Write post copy that sounds genuinely human — warm, grounded, and personal.
Output ONLY valid JSON, no preamble, no markdown fences.`,
                    messages: [{ role: 'user', content: prompt }],
                });
                break;
            } catch (err) {
                const isRateLimit = err instanceof Anthropic.RateLimitError;
                if (isRateLimit && attempt < 3) {
                    const waitMs = 60_000 * attempt;
                    this.log.warn({ attempt, waitMs }, 'Rate limit hit — waiting before retry');
                    await new Promise((r) => setTimeout(r, waitMs));
                    continue;
                }
                throw err;
            }
        }

        this.log.info(
            {
                event: 'outbound.response',
                system: 'anthropic',
                operation: 'messages.create',
                durationMs: Date.now() - startedAt,
                stopReason: response!.stop_reason,
            },
            'Outbound response received'
        );

        let text = '';
        for (const block of response!.content) {
            if (block.type === 'text') text += block.text;
        }

        let clean = text.trim();
        if (clean.startsWith('```')) {
            const parts = clean.split('```');
            clean = parts[1] ?? '';
            if (clean.startsWith('json')) clean = clean.slice(4);
        }

        return JSON.parse(clean) as GeneratedCampaign;
    }

    private buildCampaignRecord(
        data: GeneratedCampaign,
        signals: AvailabilitySignals,
        trendsBriefId?: string
    ): Campaign {
        const now = new Date().toISOString();

        const posts: SocialPost[] = data.posts.map((p: GeneratedPost) => ({
            id: randomUUID(),
            campaigns: [], // populated after saveCampaign links them via junction table
            source: 'campaign' as const,
            platform: p.platform,
            postType: p.postType,
            contentPillar: p.contentPillar,
            copy: p.copy,
            imageDirection: p.imageDirection,
            hashtags: p.hashtags,
            callToAction: p.callToAction,
            scheduledFor: p.scheduledDate ? `${p.scheduledDate}T09:00:00+08:00` : undefined,
            status: 'pending_review' as PostStatus,
            createdAt: now,
        }));

        return {
            id: randomUUID(),
            name: data.campaignName,
            theme: data.campaignTheme,
            description: data.campaignDescription,
            targetServices: data.targetServices,
            durationWeeks: data.durationWeeks,
            status: 'pending_review',
            freshaSignals: Object.fromEntries(
                Object.entries(signals).map(([k, v]) => [k, { signal: v.signal, slots: v.availableSlots }])
            ),
            trendsBriefId,
            createdAt: now,
            posts,
        };
    }

    private getMockCampaign(): GeneratedCampaign {
        const start = nextMonday(new Date());
        const posts: GeneratedPost[] = [
            {
                week: 1,
                day: 'Monday',
                scheduledDate: format(start),
                platform: 'instagram',
                postType: 'feed',
                contentPillar: 'education',
                copy: '[MOCK] Did you know infrared saunas can help reduce inflammation and promote deep relaxation? Our Infrared Sauna POD sessions are the perfect way to reset after a long week. Your body will thank you. \u2728\n\nBook your session today \u2192 bodyspacerecoverystudio.com.au',
                imageDirection: 'Warm amber-lit interior shot of infrared sauna pod',
                hashtags: ['infraredsauna', 'perthwellness', 'bodyspace', 'recovery', 'selfcare'],
                callToAction: 'Book online',
                serviceFocus: 'infrared_sauna_pod',
            },
            {
                week: 1,
                day: 'Wednesday',
                scheduledDate: format(addDays(start, 2)),
                platform: 'instagram',
                postType: 'feed',
                contentPillar: 'promotion',
                copy: '[MOCK] This week only \u2014 $99 Recovery Combo: NormaTec Boots + Infrared Sauna. Your legs (and your mind) deserve it. \ud83d\ude4f\n\nSpots are limited, book now \u2192 bodyspacerecoverystudio.com.au',
                imageDirection: 'Close-up of NormaTec boots on relaxed client',
                hashtags: ['normatec', 'recovery', 'perthfitness', 'wellness', 'jandakot'],
                callToAction: 'Book the combo',
                serviceFocus: 'normatec',
            },
            {
                week: 1,
                day: 'Friday',
                scheduledDate: format(addDays(start, 4)),
                platform: 'facebook',
                postType: 'feed',
                contentPillar: 'community',
                copy: '[MOCK] We love seeing our regulars walk out feeling lighter. Thanks to everyone who visited BodySpace this week \u2014 you\u2019re investing in yourselves and it shows. See you next week! \u2764\ufe0f',
                imageDirection: 'Candid reception area photo with warm lighting',
                hashtags: ['bodyspace', 'cockburn', 'community'],
                callToAction: 'Book your next visit',
                serviceFocus: undefined,
            },
            {
                week: 2,
                day: 'Monday',
                scheduledDate: format(addDays(start, 7)),
                platform: 'instagram',
                postType: 'feed',
                contentPillar: 'education',
                copy: '[MOCK] Lymphatic drainage isn\u2019t just a trend \u2014 it\u2019s one of the most effective ways to support your immune system and reduce fluid retention. Our BodyROLL machine makes it gentle, relaxing, and genuinely effective.',
                imageDirection: 'BodyROLL machine in use, soft studio lighting',
                hashtags: ['lymphaticdrainage', 'bodyroll', 'perthhealth', 'wellness', 'holistic'],
                callToAction: 'Learn more',
                serviceFocus: 'bodyroll',
            },
            {
                week: 2,
                day: 'Wednesday',
                scheduledDate: format(addDays(start, 9)),
                platform: 'instagram',
                postType: 'feed',
                contentPillar: 'seasonal',
                copy: '[MOCK] Autumn is the perfect time to slow down and reconnect with your body. As the days shorten, give yourself permission to rest and restore. \ud83c\udf42',
                imageDirection: 'Autumn-toned flat lay with candles and towels',
                hashtags: ['autumn', 'perthautumn', 'slowdown', 'selfcare', 'bodyspace'],
                callToAction: 'Book a treatment',
                serviceFocus: undefined,
            },
            {
                week: 2,
                day: 'Friday',
                scheduledDate: format(addDays(start, 11)),
                platform: 'facebook',
                postType: 'feed',
                contentPillar: 'promotion',
                copy: '[MOCK] FIFO workers \u2014 we see you. Come in for a Remedial Massage + NormaTec session and feel human again after your swing. You\u2019ve earned it.',
                imageDirection: 'Male client relaxing post-treatment',
                hashtags: ['fifo', 'remedial', 'recovery'],
                callToAction: 'Book now',
                serviceFocus: 'remedial_massage',
            },
            {
                week: 3,
                day: 'Monday',
                scheduledDate: format(addDays(start, 14)),
                platform: 'instagram',
                postType: 'feed',
                contentPillar: 'social_proof',
                copy: '[MOCK] \u2b50 \u201cBest massage I\u2019ve had in Perth. The studio is so peaceful and Mel really listens to what your body needs.\u201d \u2014 Sarah K.\n\nThank you Sarah! Reviews like this make our day.',
                imageDirection: 'Testimonial graphic with studio branding',
                hashtags: ['perthreview', 'testimonial', 'massage', 'bodyspace', 'jandakot'],
                callToAction: 'Read more reviews',
                serviceFocus: 'relaxation_massage',
            },
            {
                week: 3,
                day: 'Wednesday',
                scheduledDate: format(addDays(start, 16)),
                platform: 'instagram',
                postType: 'feed',
                contentPillar: 'education',
                copy: '[MOCK] Reiki isn\u2019t \u201cwoo woo\u201d \u2014 it\u2019s a deeply grounding practice that helps calm your nervous system. Perfect for anyone feeling overwhelmed or burnt out.',
                imageDirection: 'Practitioner hands hovering over client, soft light',
                hashtags: ['reiki', 'energyhealing', 'perthreiki', 'calm', 'nervous system'],
                callToAction: 'Book a session',
                serviceFocus: 'reiki',
            },
            {
                week: 3,
                day: 'Friday',
                scheduledDate: format(addDays(start, 18)),
                platform: 'facebook',
                postType: 'feed',
                contentPillar: 'promotion',
                copy: '[MOCK] Gift cards now available! Not sure what to get someone? Give them the gift of relaxation. \ud83c\udf81\n\nbodyspacerecoverystudio.com.au/gift-cards',
                imageDirection: 'Gift card product shot on linen background',
                hashtags: ['giftcard', 'perthgifts', 'wellness'],
                callToAction: 'Buy a gift card',
                serviceFocus: undefined,
            },
            {
                week: 4,
                day: 'Monday',
                scheduledDate: format(addDays(start, 21)),
                platform: 'instagram',
                postType: 'feed',
                contentPillar: 'seasonal',
                copy: '[MOCK] Autumn \u2192 shorter days \u2192 more time for YOU. Our Infrared Sauna + Shrinking Violet body wrap is the ultimate autumn indulgence. Detox, tone, and relax in one session.',
                imageDirection: 'Body wrap treatment in progress, warm tones',
                hashtags: ['bodywrap', 'infrared', 'detox', 'autumn', 'perthwellness'],
                callToAction: 'Book the combo',
                serviceFocus: 'infrared_shrinking_violet',
            },
            {
                week: 4,
                day: 'Wednesday',
                scheduledDate: format(addDays(start, 23)),
                platform: 'instagram',
                postType: 'feed',
                contentPillar: 'promotion',
                copy: '[MOCK] Pregnancy massage at BodySpace \u2014 because growing a human is hard work. Gentle, supportive, and exactly what your body needs right now. \ud83e\uddf1',
                imageDirection: 'Soft pregnancy massage setup with pillows',
                hashtags: ['pregnancymassage', 'prenatal', 'perthmums', 'bodyspace', 'selfcare'],
                callToAction: 'Book online',
                serviceFocus: 'pregnancy_massage',
            },
            {
                week: 4,
                day: 'Friday',
                scheduledDate: format(addDays(start, 25)),
                platform: 'facebook',
                postType: 'feed',
                contentPillar: 'community',
                copy: '[MOCK] Thank you for an incredible month, BodySpace family. We\u2019re so grateful for every single one of you who walks through our doors. Here\u2019s to another month of rest, recovery, and feeling your best. \u2764\ufe0f',
                imageDirection: 'Team photo or studio exterior at golden hour',
                hashtags: ['bodyspace', 'thankyou', 'community'],
                callToAction: 'See you next month',
                serviceFocus: undefined,
            },
        ];
        return {
            campaignName: '[MOCK] Autumn Reset',
            campaignTheme: 'Slow down, warm up, and invest in your recovery this autumn.',
            campaignDescription:
                '[MOCK] A 4-week campaign focused on autumn wellness, targeting recovery services and infrared treatments. Designed to drive bookings for underutilised services while building community engagement.',
            targetServices: ['infrared_sauna_pod', 'normatec', 'bodyroll', 'remedial_massage'],
            durationWeeks: 4,
            posts,
        };
    }
}
