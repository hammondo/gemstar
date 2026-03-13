// src/agents/campaign-planner/agent.ts
// Generates full campaign plans + social post drafts, using Fresha signals + trends brief.

import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { addDays, nextMonday, format } from "../../utils/dates.js";
import { settings, getBrandVoice, getAllServices } from "../../config.js";
import { saveCampaign, getLatestSignals, getLatestTrendsBrief } from "../../db.js";
import type {
  Campaign, SocialPost, AvailabilitySignals, TrendsBrief,
  GeneratedCampaign, GeneratedPost, PostStatus,
} from "../../types.js";

export class CampaignPlannerAgent {
  private client: Anthropic;
  private brand = getBrandVoice();
  private services = getAllServices();

  constructor() {
    this.client = new Anthropic({ apiKey: settings.anthropicApiKey });
  }

  async run(options: {
    availabilitySignals?: AvailabilitySignals;
    trendsBrief?: TrendsBrief | null;
    ownerBrief?: string;
  } = {}): Promise<Campaign> {
    const signals = options.availabilitySignals ?? getLatestSignals();
    const brief = options.trendsBrief ?? getLatestTrendsBrief();

    const pushServices = Object.fromEntries(
      Object.entries(signals).filter(([, v]) => v.signal === "push")
    );
    const pauseServices = Object.fromEntries(
      Object.entries(signals).filter(([, v]) => v.signal === "pause")
    );

    console.log(`[CampaignPlanner] PUSH: ${Object.keys(pushServices).length} services, PAUSE: ${Object.keys(pauseServices).length}`);

    const prompt = this.buildPrompt(pushServices, pauseServices, brief, options.ownerBrief);
    const generated = await this.generate(prompt);
    const campaign = this.buildCampaignRecord(generated, signals, brief?.id);

    saveCampaign(campaign);

    // Write to pending-review folder
    const dir = resolve(settings.dataDir, "pending-review");
    mkdirSync(dir, { recursive: true });
    const filename = `campaign_${campaign.id.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(resolve(dir, filename), JSON.stringify(campaign, null, 2));

    console.log(`[CampaignPlanner] Campaign '${campaign.name}' created with ${campaign.posts.length} posts`);
    return campaign;
  }

  private buildPrompt(
    pushServices: AvailabilitySignals,
    pauseServices: AvailabilitySignals,
    brief: TrendsBrief | null,
    ownerBrief?: string,
  ): string {
    const b = this.brand;
    const today = new Date();
    const campaignEnd = addDays(today, 28);

    const pushList = Object.values(pushServices).length
      ? Object.values(pushServices).map((v) => `  - ${v.serviceName} (${v.availableSlots} slots free)`).join("\n")
      : "  (none — all services have normal availability)";

    const pauseList = Object.values(pauseServices).length
      ? Object.values(pauseServices).map((v) => `  - ${v.serviceName} (${v.availableSlots} slots — nearly booked)`).join("\n")
      : "  (none)";

    const trendsContext = brief ? `
WEEKLY TRENDS BRIEF:
- Competitor activity: ${brief.competitorSummary}
- Trend signals: ${brief.trendSignals}
- Seasonal factors: ${brief.seasonalFactors}
- Recommended focus: ${brief.recommendedFocus}
- Opportunities: ${brief.opportunities}
` : "";

    const ownerContext = ownerBrief ? `\nOWNER'S REQUEST:\n${ownerBrief}\n` : "";

    // Build schedule: Mon/Wed/Fri for 4 weeks
    const scheduleDates = this.buildScheduleDates(today);

    return `
Today: ${format(today)}
Campaign period: ${format(today)} → ${format(campaignEnd)}

BRAND VOICE:
- Tone: ${b.brandVoice.tone.join("; ")}
- Avoid: ${b.brandVoice.avoid.join("; ")}
- Style: Australian spelling, warm and personal, never salesy

AUDIENCE:
- Primary: ${b.audience.primary.join(", ")}
- Secondary: ${b.audience.secondary.join(", ")}
- Pain points: ${b.audience.painPoints.join(", ")}

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
${scheduleDates.map((d, i) => `  Post ${i + 1}: ${d.label} (${d.platform})`).join("\n")}

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
    const platforms = ["instagram", "instagram", "facebook"]; // Mon=IG, Wed=IG, Fri=FB
    let current = nextMonday(start);

    for (let week = 0; week < 4; week++) {
      const mon = addDays(current, week * 7);
      const wed = addDays(mon, 2);
      const fri = addDays(mon, 4);

      dates.push({ date: format(mon), label: `Week ${week + 1} Mon`, platform: platforms[0] });
      dates.push({ date: format(wed), label: `Week ${week + 1} Wed`, platform: platforms[1] });
      dates.push({ date: format(fri), label: `Week ${week + 1} Fri`, platform: platforms[2] });
    }

    return dates;
  }

  private async generate(prompt: string): Promise<GeneratedCampaign> {
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: `You are the marketing strategist and copywriter for BodySpace Recovery Studio, 
a warm holistic wellness studio in Jandakot, Perth, Western Australia. 
Write post copy that sounds genuinely human — warm, grounded, and personal.
Output ONLY valid JSON, no preamble, no markdown fences.`,
      messages: [{ role: "user", content: prompt }],
    });

    let text = "";
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
    }

    let clean = text.trim();
    if (clean.startsWith("```")) {
      const parts = clean.split("```");
      clean = parts[1] ?? "";
      if (clean.startsWith("json")) clean = clean.slice(4);
    }

    return JSON.parse(clean) as GeneratedCampaign;
  }

  private buildCampaignRecord(
    data: GeneratedCampaign,
    signals: AvailabilitySignals,
    trendsBriefId?: string,
  ): Campaign {
    const now = new Date().toISOString();

    const posts: SocialPost[] = data.posts.map((p: GeneratedPost) => ({
      id: randomUUID(),
      campaignId: "", // filled by saveCampaign
      platform: p.platform,
      postType: p.postType,
      contentPillar: p.contentPillar,
      copy: p.copy,
      imageDirection: p.imageDirection,
      hashtags: p.hashtags,
      callToAction: p.callToAction,
      scheduledFor: p.scheduledDate ? `${p.scheduledDate}T09:00:00+08:00` : undefined,
      status: "pending_review" as PostStatus,
      createdAt: now,
    }));

    return {
      id: randomUUID(),
      name: data.campaignName,
      theme: data.campaignTheme,
      description: data.campaignDescription,
      targetServices: data.targetServices,
      durationWeeks: data.durationWeeks,
      status: "pending_review",
      freshaSignals: Object.fromEntries(
        Object.entries(signals).map(([k, v]) => [k, { signal: v.signal, slots: v.availableSlots }])
      ),
      trendsBriefId,
      createdAt: now,
      posts,
    };
  }
}

// Run standalone
if (process.argv[1].endsWith("agent.ts") || process.argv[1].endsWith("agent.js")) {
  const agent = new CampaignPlannerAgent();
  agent.run({ ownerBrief: process.argv[2] }).then((campaign) => {
    console.log(`\nCampaign: ${campaign.name}`);
    console.log(`Posts: ${campaign.posts.length}`);
    console.log(`Status: ${campaign.status}`);
  });
}
