import cron from 'node-cron';
import { CampaignPlannerAgent } from './agents/campaign-planner/agent.js';
import { FreshaWatcherAgent } from './agents/fresha-watcher/agent.js';
import { ImageGeneratorAgent } from './agents/image-generator/agent.js';
import { MonitorAgent } from './agents/monitor/agent.js';
import { type AuditTrigger, type UserContext, withAudit } from './audit.js';
import { settings } from './config.js';
import { ApprovalWorkflow } from './workflows/approval.js';

export interface RunAllOptions {
    ownerBrief?: string;
    user?: UserContext | null;
    trigger?: AuditTrigger;
}

export class BodyspaceOrchestrator {
    async runFreshaWatcher(user?: UserContext | null, trigger: AuditTrigger = 'api'): Promise<void> {
        console.log('\n[Orchestrator] Running FreshaWatcher...');
        await withAudit('fresha-watcher', trigger, user, async () => {
            const agent = new FreshaWatcherAgent();
            const signals = await agent.run();
            const pushCount = Object.values(signals).filter((v) => v.signal === 'push').length;
            return { signalCount: Object.keys(signals).length, pushCount };
        });
    }

    async runMonitor(user?: UserContext | null, trigger: AuditTrigger = 'api'): Promise<void> {
        console.log('\n[Orchestrator] Running Monitor...');
        await withAudit('monitor', trigger, user, async () => {
            const agent = new MonitorAgent();
            const brief = await agent.run();
            return { briefId: brief.id, confidence: brief.confidence };
        });
    }

    async runCampaignPlanner(
        ownerBrief?: string,
        user?: UserContext | null,
        trigger: AuditTrigger = 'api'
    ): Promise<void> {
        console.log('\n[Orchestrator] Running CampaignPlanner...');
        await withAudit(
            'campaign-planner',
            trigger,
            user,
            async () => {
                const approval = new ApprovalWorkflow();
                const planner = new CampaignPlannerAgent();

                const watcher = new FreshaWatcherAgent();
                const signals = watcher.getLatestSignals();
                const pushCount = Object.values(signals).filter((v) => v.signal === 'push').length;

                if (pushCount === 0 && !ownerBrief) {
                    console.log('[Orchestrator] Skipping campaign: no PUSH services and no owner brief');
                    return { skipped: true, reason: 'no PUSH services and no owner brief' };
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

                return { campaignId: campaign.id, campaignName: campaign.name };
            },
            { input: ownerBrief ? { ownerBrief } : undefined }
        );
    }

    async runAll(options: RunAllOptions = {}): Promise<void> {
        await this.runFreshaWatcher(options.user, options.trigger ?? 'api');
        await this.runMonitor(options.user, options.trigger ?? 'api');
        await this.runCampaignPlanner(options.ownerBrief, options.user, options.trigger ?? 'api');
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
            void orchestrator.runFreshaWatcher(null, 'cron').catch((err) => {
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
            void orchestrator.runMonitor(null, 'cron').catch((err) => {
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
            void orchestrator.runCampaignPlanner(undefined, null, 'cron').catch((err) => {
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

export default new BodyspaceOrchestrator();
