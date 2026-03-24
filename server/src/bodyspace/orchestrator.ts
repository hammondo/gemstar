import cron from 'node-cron';
import { CampaignPlannerAgent } from './agents/campaign-planner/agent.js';
import { FreshaWatcherAgent } from './agents/fresha-watcher/agent.js';
import { ImageGeneratorAgent } from './agents/image-generator/agent.js';
import { MonitorAgent } from './agents/monitor/agent.js';
import { settings } from './config.js';
import { ApprovalWorkflow } from './workflows/approval.js';

export interface RunAllOptions {
    ownerBrief?: string;
}

export class BodyspaceOrchestrator {
    async runFreshaWatcher(): Promise<void> {
        console.log('\n[Orchestrator] Running FreshaWatcher...');
        const agent = new FreshaWatcherAgent();
        await agent.run();
    }

    async runMonitor(): Promise<void> {
        console.log('\n[Orchestrator] Running Monitor...');
        const agent = new MonitorAgent();
        await agent.run();
    }

    async runCampaignPlanner(ownerBrief?: string): Promise<void> {
        console.log('\n[Orchestrator] Running CampaignPlanner...');
        const approval = new ApprovalWorkflow();
        const planner = new CampaignPlannerAgent();

        const watcher = new FreshaWatcherAgent();
        const signals = watcher.getLatestSignals();
        const pushCount = Object.values(signals).filter((v) => v.signal === 'push').length;

        if (pushCount === 0 && !ownerBrief) {
            console.log('[Orchestrator] Skipping campaign: no PUSH services and no owner brief');
            return;
        }

        const campaign = await planner.run({ ownerBrief });
        await approval.notifyOwner(campaign);
        console.log(`[Orchestrator] Campaign '${campaign.name}' ready for owner review`);

        // Fire image generation in the background — owner sees notification immediately
        // and images arrive as drafts while they're reviewing the copy
        const imageGen = new ImageGeneratorAgent();
        void imageGen.run(campaign.id).catch((err) => {
            console.error('[Orchestrator] Image generation failed:', err);
        });
    }

    async runAll(options: RunAllOptions = {}): Promise<void> {
        await this.runFreshaWatcher();
        await this.runMonitor();
        await this.runCampaignPlanner(options.ownerBrief);
    }
}

let schedulerStarted = false;

export function startBodyspaceScheduler(orchestrator = new BodyspaceOrchestrator()): void {
    if (schedulerStarted) {
        return;
    }

    schedulerStarted = true;

    cron.schedule(
        settings.freshaWatcherCron,
        () => {
            void orchestrator.runFreshaWatcher().catch((err) => {
                console.error('[Scheduler] Fresha watcher failed', err);
            });
        },
        {
            timezone: settings.timezone,
            name: 'fresha-watcher',
        }
    );

    cron.schedule(
        settings.monitorAgentCron,
        () => {
            void orchestrator.runMonitor().catch((err) => {
                console.error('[Scheduler] Monitor failed', err);
            });
        },
        {
            timezone: settings.timezone,
            name: 'monitor',
        }
    );

    cron.schedule(
        settings.campaignPlannerCron,
        () => {
            void orchestrator.runCampaignPlanner().catch((err) => {
                console.error('[Scheduler] Campaign planner failed', err);
            });
        },
        {
            timezone: settings.timezone,
            name: 'campaign-planner',
        }
    );

    console.log('[Scheduler] BodySpace cron jobs are active');
}
