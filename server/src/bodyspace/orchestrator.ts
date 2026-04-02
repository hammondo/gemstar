import cron from 'node-cron';
import { CampaignPlannerAgent } from './agents/campaign-planner/agent.js';
import { FreshaWatcherAgent } from './agents/fresha-watcher/agent.js';
import { ImageGeneratorAgent } from './agents/image-generator/agent.js';
import { MonitorAgent } from './agents/monitor/agent.js';
import { settings } from './config.js';
import { ApprovalWorkflow } from './workflows/approval.js';
import { type AuditTrigger, type UserContext, failAudit, finishAudit, startAudit } from './audit.js';

export interface RunAllOptions {
    ownerBrief?: string;
    user?: UserContext | null;
    trigger?: AuditTrigger;
}

export class BodyspaceOrchestrator {
    async runFreshaWatcher(user?: UserContext | null, trigger: AuditTrigger = 'api'): Promise<void> {
        console.log('\n[Orchestrator] Running FreshaWatcher...');
        const auditId = startAudit('fresha-watcher', trigger, user);
        try {
            const agent = new FreshaWatcherAgent();
            const signals = await agent.run();
            const pushCount = Object.values(signals).filter((v) => v.signal === 'push').length;
            finishAudit(auditId, { signalCount: Object.keys(signals).length, pushCount });
        } catch (err) {
            failAudit(auditId, err);
            throw err;
        }
    }

    async runMonitor(user?: UserContext | null, trigger: AuditTrigger = 'api'): Promise<void> {
        console.log('\n[Orchestrator] Running Monitor...');
        const auditId = startAudit('monitor', trigger, user);
        try {
            const agent = new MonitorAgent();
            const brief = await agent.run();
            finishAudit(auditId, { briefId: brief.id, confidence: brief.confidence });
        } catch (err) {
            failAudit(auditId, err);
            throw err;
        }
    }

    async runCampaignPlanner(ownerBrief?: string, user?: UserContext | null, trigger: AuditTrigger = 'api'): Promise<void> {
        console.log('\n[Orchestrator] Running CampaignPlanner...');
        const auditId = startAudit('campaign-planner', trigger, user, ownerBrief ? { ownerBrief } : undefined);
        try {
            const approval = new ApprovalWorkflow();
            const planner = new CampaignPlannerAgent();

            const watcher = new FreshaWatcherAgent();
            const signals = watcher.getLatestSignals();
            const pushCount = Object.values(signals).filter((v) => v.signal === 'push').length;

            if (pushCount === 0 && !ownerBrief) {
                console.log('[Orchestrator] Skipping campaign: no PUSH services and no owner brief');
                finishAudit(auditId, { skipped: true, reason: 'no PUSH services and no owner brief' });
                return;
            }

            const campaign = await planner.run({ ownerBrief });
            await approval.notifyOwner(campaign);
            console.log(`[Orchestrator] Campaign '${campaign.name}' ready for owner review`);

            finishAudit(auditId, { campaignId: campaign.id, campaignName: campaign.name });

            // Fire image generation in the background — owner sees notification immediately
            // and images arrive as drafts while they're reviewing the copy
            const imageGen = new ImageGeneratorAgent();
            void imageGen.run(campaign.id).catch((err) => {
                console.error('[Orchestrator] Image generation failed:', err);
            });
        } catch (err) {
            failAudit(auditId, err);
            throw err;
        }
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
