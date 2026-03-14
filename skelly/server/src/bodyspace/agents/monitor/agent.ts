// src/agents/monitor/agent.ts
// Weekly research agent: competitor monitoring + Perth wellness trend analysis.

import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { settings, getCompetitors } from "../../config.js";
import { saveTrendsBrief, getLatestTrendsBrief } from "../../db.js";
import type { TrendsBrief, GeneratedTrendsBrief } from "../../types.js";

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
  private client: Anthropic;

  constructor() {
    if (!settings.anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY is required to run MonitorAgent");
    }
    this.client = new Anthropic({ apiKey: settings.anthropicApiKey });
  }

  async run(): Promise<TrendsBrief> {
    console.log("[Monitor] Starting weekly research...");
    const prompt = this.buildPrompt();
    const data = await this.runResearch(prompt);
    const brief = saveTrendsBrief(data);

    // Write to file for easy review
    const trendsDir = resolve(settings.dataDir, "trends");
    mkdirSync(trendsDir, { recursive: true });
    const filename = `brief_${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(resolve(trendsDir, filename), JSON.stringify(data, null, 2));

    console.log(`[Monitor] Brief saved: ${filename}`);
    return brief;
  }

  private buildPrompt(): string {
    const today = new Date().toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Australia/Perth",
    });
    const month = new Date().toLocaleString("en-AU", {
      month: "long",
      timeZone: "Australia/Perth",
    });

    return `
Today is ${today}.

Research and produce a weekly intelligence brief for BodySpace Recovery Studio (Jandakot, Perth WA).

RESEARCH TASKS:

1. Search for recent promotions or new services from Perth wellness competitors:
   - "wellness studio Cockburn Perth" 
   - "massage infrared sauna Jandakot Cockburn"
   - "Float Perth", "O2 Float", any Fresha-listed massage/wellness studios in southern Perth

2. Search current wellness trends in Australia:
   - "infrared sauna benefits trending Australia 2026"
   - "NormaTec recovery boots trending"
   - "lymphatic drainage massage Perth"
   - "holistic healing Reiki Perth"

3. Search Perth seasonal/lifestyle context for ${month}:
   - FIFO worker roster patterns and wellness needs
   - Perth sporting events or lifestyle factors this month
   - Any Australian health awareness campaigns or days in ${month}

4. Search: "wellness studio marketing trends Australia 2026"

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
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      tools: [{ name: "web_search", type: "web_search_20250305" }] as never,
      messages: [{ role: "user", content: prompt }],
    });

    // Extract text from response (may include tool_use blocks from web search)
    let text = "";
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
    }

    return this.parseJson(text);
  }

  private parseJson(text: string): GeneratedTrendsBrief {
    let clean = text.trim();
    if (clean.startsWith("```")) {
      const parts = clean.split("```");
      clean = parts[1] ?? "";
      if (clean.startsWith("json")) clean = clean.slice(4);
    }

    try {
      return JSON.parse(clean) as GeneratedTrendsBrief;
    } catch {
      console.error("[Monitor] Failed to parse JSON response, using fallback");
      return {
        weekOf: new Date().toISOString(),
        competitorSummary: text.slice(0, 500),
        trendSignals: "",
        seasonalFactors: "",
        recommendedFocus: "",
        opportunities: "",
        sources: [],
        confidence: "low",
      };
    }
  }

  getLatestBrief(): TrendsBrief | null {
    return getLatestTrendsBrief();
  }
}
