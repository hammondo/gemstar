// src/agents/monitor/agent.ts
// Weekly research agent: competitor monitoring + Perth wellness trend analysis.

import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { settings } from '../../config.js';
import { getLatestTrendsBrief, saveTrendsBrief } from '../../db.js';
import type { GeneratedTrendsBrief, TrendsBrief } from '../../types.js';

export interface MonitorProgressEvent {
    type: 'status' | 'text' | 'done' | 'error';
    message: string;
}

export type OnProgress = (event: MonitorProgressEvent) => void;

const SYSTEM_PROMPT = `
You are a market research specialist for BodySpace Recovery Studio —
a wellness studio in Jandakot (Cockburn area), Perth, Western Australia.

Services offered: Relaxation Massage, Remedial Massage, Pregnancy Massage,
Reiki, Chakra Balance, AromaTouch, Ayurvedic Foot Massage, Energy Healing for Children,
BodyROLL lymphatic machine, Infrared Sauna POD, NormaTec Recovery Boots,
Infrared Sauna + Shrinking Violet body wrap, combination packages.

Produce a weekly intelligence brief covering:
1. Competitor activity in Perth/Cockburn/southern suburbs
2. Wellness trends relevant to BodySpace services in Australia/Perth
3. Perth-specific seasonal and lifestyle factors
4. Recommended campaign focus for BodySpace
5. Gaps or opportunities BodySpace could capitalise on

Be specific and practical. Focus on actionable insights for a small wellness studio.
Output ONLY valid JSON — no preamble, no markdown fences.
`;

export class MonitorAgent {
    private client: Anthropic | null;

    constructor() {
        if (settings.mockAnthropic) {
            console.log('[Monitor] Running in MOCK mode');
            this.client = null;
        } else {
            if (!settings.anthropicApiKey) {
                throw new Error('ANTHROPIC_API_KEY is required to run MonitorAgent');
            }
            this.client = new Anthropic({ apiKey: settings.anthropicApiKey });
        }
    }

    async run(): Promise<TrendsBrief> {
        console.log('[Monitor] Starting weekly research...');
        const data = settings.mockAnthropic ? this.getMockBrief() : await this.runResearch(this.buildPrompt());
        const brief = saveTrendsBrief(data);

        // Write to file for easy review
        const trendsDir = resolve(settings.dataDir, 'trends');
        mkdirSync(trendsDir, { recursive: true });
        const filename = `brief_${new Date().toISOString().slice(0, 10)}.json`;
        writeFileSync(resolve(trendsDir, filename), JSON.stringify(data, null, 2));

        console.log(`[Monitor] Brief saved: ${filename}`);
        return brief;
    }

    async runStreaming(onProgress: OnProgress): Promise<TrendsBrief> {
        console.log('[Monitor] Starting weekly research (streaming)...');
        onProgress({ type: 'status', message: 'Building research prompt...' });

        const prompt = this.buildPrompt();
        onProgress({
            type: 'status',
            message: 'Starting Claude research with web search...',
        });

        const data = settings.mockAnthropic
            ? await this.getMockBriefStreaming(onProgress)
            : await this.runResearchStreaming(prompt, onProgress);
        const brief = saveTrendsBrief(data);

        const trendsDir = resolve(settings.dataDir, 'trends');
        mkdirSync(trendsDir, { recursive: true });
        const filename = `brief_${new Date().toISOString().slice(0, 10)}.json`;
        writeFileSync(resolve(trendsDir, filename), JSON.stringify(data, null, 2));

        onProgress({ type: 'done', message: `Brief saved: ${filename}` });
        console.log(`[Monitor] Brief saved: ${filename}`);
        return brief;
    }

    private buildPrompt(): string {
        const today = new Date().toLocaleDateString('en-AU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'Australia/Perth',
        });
        const month = new Date().toLocaleString('en-AU', {
            month: 'long',
            timeZone: 'Australia/Perth',
        });

        return `
Today is ${today}.

Research and produce a weekly intelligence brief for BodySpace Recovery Studio (Jandakot, Perth WA).

RESEARCH TASKS (perform up to 5 focused searches total):

1. Search: "wellness studio Cockburn Perth" OR "massage infrared sauna southern Perth" — summarise any competitor promos or new services.

2. Search: "infrared sauna lymphatic drainage wellness trends Perth Australia 2026" — identify rising trends relevant to BodySpace.

3. Search: "Perth ${month} wellness FIFO lifestyle" — capture seasonal and lifestyle context for this month.

Return ONLY valid JSON matching this exact schema:
{
  "weekOf": "${today}",
  "competitorSummary": "3-5 sentences on what competitors are doing, any new services or promos spotted",
  "trendSignals": "3-5 sentences on rising wellness trends relevant to BodySpace in Perth/AU",
  "seasonalFactors": "2-3 sentences on Perth/AU seasonal context relevant right now",
  "recommendedFocus": "Specific recommendation: which BodySpace services/themes to prioritise this week and why",
  "opportunities": "1-3 specific gaps or opportunities BodySpace could capitalise on",
  "sources": ["url or search query used"],
  "confidence": "high|medium|low"
}
`;
    }

    private async runResearch(prompt: string): Promise<GeneratedTrendsBrief> {
        const response = await this.client!.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            system: SYSTEM_PROMPT,
            tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] as never,
            messages: [{ role: 'user', content: prompt }],
        });

        // Extract text from response (may include tool_use blocks from web search)
        let text = '';
        for (const block of response.content) {
            if (block.type === 'text') text += block.text;
        }

        return this.parseJson(text);
    }

    private async runResearchStreaming(prompt: string, onProgress: OnProgress): Promise<GeneratedTrendsBrief> {
        const stream = this.client!.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            system: SYSTEM_PROMPT,
            tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] as never,
            messages: [{ role: 'user', content: prompt }],
        });

        let text = '';
        let searchCount = 0;

        stream.on('streamEvent', (event) => {
            if (event.type === 'content_block_start' && 'type' in event.content_block) {
                const blockType = event.content_block.type;
                // Built-in tools (e.g. web_search) emit 'server_tool_use' in newer API versions;
                if (blockType === 'server_tool_use' && 'name' in event.content_block) {
                    searchCount++;
                    onProgress({
                        type: 'status',
                        message: `Web search #${searchCount} in progress...`,
                    });
                } else if (blockType === 'text') {
                    onProgress({
                        type: 'status',
                        message: 'Generating brief...',
                    });
                }
            }
        });

        stream.on('text', (chunk) => {
            text += chunk;
            onProgress({ type: 'text', message: chunk });
        });

        await stream.finalMessage();

        onProgress({
            type: 'status',
            message: `Research complete — ${searchCount} web searches performed`,
        });

        return this.parseJson(text);
    }

    private parseJson(text: string): GeneratedTrendsBrief {
        let clean = text.trim();
        if (clean.startsWith('```')) {
            const parts = clean.split('```');
            clean = parts[1] ?? '';
            if (clean.startsWith('json')) clean = clean.slice(4);
        }

        try {
            return JSON.parse(clean) as GeneratedTrendsBrief;
        } catch {
            console.error('[Monitor] Failed to parse JSON response, using fallback');
            return {
                weekOf: new Date().toISOString(),
                competitorSummary: text.slice(0, 500),
                trendSignals: '',
                seasonalFactors: '',
                recommendedFocus: '',
                opportunities: '',
                sources: [],
                confidence: 'low',
            };
        }
    }

    private getMockBrief(): GeneratedTrendsBrief {
        const today = new Date().toLocaleDateString('en-AU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'Australia/Perth',
        });
        return {
            weekOf: today,
            competitorSummary:
                '[MOCK] Float Perth launched a new magnesium float package. O2 Float is running a March Madness promo. Local Cockburn studios are quiet on social.',
            trendSignals:
                '[MOCK] Infrared sauna demand continues to rise in Perth metro. NormaTec recovery boots trending with weekend athletes. Lymphatic drainage gaining mainstream awareness via TikTok.',
            seasonalFactors:
                '[MOCK] Autumn approaching — daylight shortening prompts indoor wellness bookings. AFL season starting drives recovery demand from weekend players.',
            recommendedFocus:
                '[MOCK] Push infrared sauna + NormaTec combo packages. Target FIFO workers returning from swing with recovery bundles.',
            opportunities:
                '[MOCK] No local competitor is offering BodyROLL lymphatic machine — unique differentiator. Consider a "Recovery Day" package bundling sauna + NormaTec + massage.',
            sources: ['[MOCK] simulated data'],
            confidence: 'medium',
        };
    }

    private async getMockBriefStreaming(onProgress: OnProgress): Promise<GeneratedTrendsBrief> {
        const steps = [
            'Searching Perth wellness competitors...',
            'Web search #1 in progress...',
            'Analysing competitor activity...',
            'Web search #2 in progress...',
            'Researching wellness trends...',
            'Web search #3 in progress...',
            'Checking seasonal factors...',
            'Generating brief...',
        ];
        for (const step of steps) {
            onProgress({ type: 'status', message: `[MOCK] ${step}` });
            await new Promise((r) => setTimeout(r, 600));
        }
        const data = this.getMockBrief();
        const json = JSON.stringify(data, null, 2);
        for (let i = 0; i < json.length; i += 40) {
            onProgress({ type: 'text', message: json.slice(i, i + 40) });
            await new Promise((r) => setTimeout(r, 30));
        }
        onProgress({
            type: 'status',
            message: '[MOCK] Research complete — 3 web searches simulated',
        });
        return data;
    }

    getLatestBrief(): TrendsBrief | null {
        return getLatestTrendsBrief();
    }
}
