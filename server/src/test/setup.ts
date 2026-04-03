/**
 * Global Vitest setup — runs before every test file.
 * Mocks all agents, external services, and the config module so tests never
 * touch the filesystem, the database, or third-party APIs.
 *
 * Class-constructor mocks use `vi.fn().mockImplementation(class { ... } as any)`
 * so the mock can be called with `new` while satisfying TypeScript's stricter
 * function signature check on mockImplementation.
 */
import { vi } from 'vitest';
import { CAMPAIGN } from './fixtures.js';

// ─── Config ───────────────────────────────────────────────────────────────────

vi.mock('../bodyspace/config.js', () => ({
    settings: {
        dataDir: '/tmp/bodyspace-test',
        apiBaseUrl: 'http://localhost:3000',
        timezone: 'Australia/Perth',
        freshaWatcherCron: '0 8 * * *',
        monitorAgentCron: '0 9 * * 1',
        campaignPlannerCron: '0 10 * * 1',
        mockAnthropic: true,
        anthropicApiKey: '',
        dashboardSessionSecret: 'test-secret',
    },
    getAllServices: vi.fn().mockReturnValue([
        { id: 'svc-sauna', name: 'Infrared Sauna', category: 'Recovery', url: '', pushThreshold: 8, pauseThreshold: 1, keyBenefits: [], targetAudience: [] },
        { id: 'svc-massage', name: 'Remedial Massage', category: 'Massage', url: '', pushThreshold: 6, pauseThreshold: 1, keyBenefits: [], targetAudience: [] },
    ]),
}));

// ─── Orchestrator ─────────────────────────────────────────────────────────────

vi.mock('../bodyspace/orchestrator.js', () => ({
    BodyspaceOrchestrator: vi.fn().mockImplementation(class {
        runFreshaWatcher = vi.fn().mockResolvedValue(undefined);
        runMonitor = vi.fn().mockResolvedValue(undefined);
        runCampaignPlanner = vi.fn().mockResolvedValue(undefined);
        runAll = vi.fn().mockResolvedValue(undefined);
    } as any),
}));

// ─── Agents ───────────────────────────────────────────────────────────────────

vi.mock('../bodyspace/agents/fresha-watcher/agent.js', () => ({
    FreshaWatcherAgent: vi.fn().mockImplementation(class {
        run = vi.fn().mockResolvedValue({ 'svc-sauna': {} });
    } as any),
}));

vi.mock('../bodyspace/agents/image-generator/agent.js', () => ({
    ImageGeneratorAgent: vi.fn().mockImplementation(class {
        run = vi.fn().mockResolvedValue(undefined);
        regenerate = vi.fn().mockResolvedValue('http://localhost:3000/api/bodyspace/images/post-001/gen.jpg');
    } as any),
}));

vi.mock('../bodyspace/agents/monitor/agent.js', () => ({
    MonitorAgent: vi.fn().mockImplementation(class {
        runStreaming = vi.fn().mockResolvedValue(undefined);
        buildPrompt = vi.fn().mockReturnValue('test monitor prompt');
    } as any),
}));

vi.mock('../bodyspace/agents/campaign-planner/agent.js', () => ({
    CampaignPlannerAgent: vi.fn().mockImplementation(class {
        run = vi.fn().mockResolvedValue(CAMPAIGN);
        buildPromptForWizard = vi.fn().mockReturnValue('test campaign planner prompt');
    } as any),
}));

vi.mock('../bodyspace/agents/scheduler/agent.js', () => ({
    SchedulerAgent: vi.fn().mockImplementation(class {
        run = vi.fn().mockResolvedValue(undefined);
    } as any),
}));

// ─── Workflows & services ─────────────────────────────────────────────────────

vi.mock('../bodyspace/workflows/approval.js', () => ({
    ApprovalWorkflow: vi.fn().mockImplementation(class {
        approveCampaign = vi.fn().mockReturnValue(CAMPAIGN);
        rejectCampaign = vi.fn().mockReturnValue(CAMPAIGN);
        approvePost = vi.fn();
        rejectPost = vi.fn();
        notifyOwner = vi.fn().mockResolvedValue(undefined);
    } as any),
}));

vi.mock('../bodyspace/services/sanity-blog-publisher.js', () => ({
    SanityBlogPublisher: vi.fn().mockImplementation(class {
        syncApprovedPost = vi.fn().mockResolvedValue({ synced: false, reason: 'Sanity not configured' });
    } as any),
}));

vi.mock('../bodyspace/services/meta-analytics.js', () => ({
    getMetaAnalytics: vi.fn().mockResolvedValue({ configured: false }),
    clearMetaCache: vi.fn(),
}));

// ─── Audit ───────────────────────────────────────────────────────────────────

vi.mock('../bodyspace/audit.js', () => ({
    startAudit: vi.fn().mockReturnValue('audit-id-mock'),
    finishAudit: vi.fn(),
    failAudit: vi.fn(),
    withAudit: vi.fn().mockImplementation((_name: string, _trigger: string, _user: unknown, fn: () => Promise<unknown>) => fn()),
}));

// ─── Third-party ──────────────────────────────────────────────────────────────

vi.mock('@azure/msal-node', () => ({
    ConfidentialClientApplication: vi.fn().mockImplementation(class {
        getAuthCodeUrl = vi.fn().mockResolvedValue('http://login.microsoftonline.com/authorize');
        acquireTokenByCode = vi.fn().mockResolvedValue({
            account: { homeAccountId: 'uid-001', name: 'Test User', username: 'test@example.com' },
        });
    } as any),
}));

vi.mock('@anthropic-ai/sdk', () => ({
    default: vi.fn().mockImplementation(class {
        messages = {
            create: vi.fn().mockResolvedValue({
                content: [{ type: 'text', text: '["term one","term two"]' }],
            }),
        };
    } as any),
}));
