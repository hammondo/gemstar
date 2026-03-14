// src/orchestrator.ts
// Master orchestrator — runs all agents on schedule.
// Usage:
//   npm run dev                          Start scheduler (runs forever)
//   tsx src/orchestrator.ts --once       Run all agents once and exit
//   tsx src/orchestrator.ts --agent fresha-watcher
//   tsx src/orchestrator.ts --campaign "Focus on Mother's Day gift vouchers"

import cron from "node-cron";
import { settings } from "./config.js";
import { FreshaWatcherAgent } from "./agents/fresha-watcher/agent.js";
import { MonitorAgent } from "./agents/monitor/agent.js";
import { CampaignPlannerAgent } from "./agents/campaign-planner/agent.js";
import { ApprovalWorkflow } from "./workflows/approval.js";

// ─── Agent runners ────────────────────────────────────────────────────────

async function runFreshaWatcher(): Promise<void> {
  console.log("\n📊 [Orchestrator] Running FreshaWatcher...");
  const agent = new FreshaWatcherAgent();
  await agent.run();
}

async function runMonitor(): Promise<void> {
  console.log("\n🔍 [Orchestrator] Running Monitor...");
  const agent = new MonitorAgent();
  await agent.run();
}

async function runCampaignPlanner(ownerBrief?: string): Promise<void> {
  console.log("\n✍️  [Orchestrator] Running CampaignPlanner...");
  const approval = new ApprovalWorkflow();
  const planner = new CampaignPlannerAgent();

  // Only generate if there are services needing promotion (or owner explicitly requested)
  const watcher = new FreshaWatcherAgent();
  const signals = watcher.getLatestSignals();
  const pushCount = Object.values(signals).filter(
    (v) => v.signal === "push",
  ).length;

  if (pushCount === 0 && !ownerBrief) {
    console.log(
      "[Orchestrator] Skipping campaign — no PUSH services (all bookings healthy)",
    );
    return;
  }

  const campaign = await planner.run({ ownerBrief });
  await approval.notifyOwner(campaign);
  console.log(
    `[Orchestrator] Campaign '${campaign.name}' ready for owner review`,
  );
}

// ─── CLI ──────────────────────────────────────────────────────────────────

debugger;

const args = process.argv.slice(2);
const isHelp = args.includes("--help");
const isOnce = args.includes("--once");
const agentArg = args[args.indexOf("--agent") + 1];
const campaignArg = args[args.indexOf("--campaign") + 1];

if (isHelp) {
  console.log(`
Usage:
  npm run dev                          Start scheduler (runs forever)
  tsx src/orchestrator.ts --once       Run all agents once and exit
  tsx src/orchestrator.ts --agent fresha-watcher
  tsx src/orchestrator.ts --campaign "Focus on Mother's Day gift vouchers"
`);
  process.exit(0);
}

if (isOnce) {
  // Run all agents sequentially and exit
  console.log("🌿 BodySpace Marketing Agent — Running all agents once\n");
  await runFreshaWatcher();
  await runMonitor();
  await runCampaignPlanner(campaignArg);
  console.log(
    "\n✅ All agents complete. Check the dashboard for campaigns to review.",
  );
  process.exit(0);
}

if (agentArg) {
  // Run a specific agent and exit
  switch (agentArg) {
    case "fresha-watcher":
      await runFreshaWatcher();
      break;
    case "monitor":
      await runMonitor();
      break;
    case "campaign-planner":
      await runCampaignPlanner(campaignArg);
      break;
    default:
      console.error(`Unknown agent: ${agentArg}`);
      process.exit(1);
  }
  process.exit(0);
}

if (campaignArg && !agentArg) {
  // Owner-requested campaign
  await runCampaignPlanner(campaignArg);
  process.exit(0);
}

// ─── Scheduled mode (default) ─────────────────────────────────────────────

console.log(`
╔══════════════════════════════════════════════════════════╗
║      BodySpace Recovery Studio — Marketing Agent         ║
╠══════════════════════════════════════════════════════════╣
║  Fresha watcher:    Daily 8am AWST                       ║
║  Competitor watch:  Weekly Monday 9am AWST               ║
║  Campaign planner:  Weekly Monday 10am AWST              ║
║  Dashboard:         ${settings.dashboardBaseUrl.padEnd(36)}║
╚══════════════════════════════════════════════════════════╝
`);

// Daily 8am AWST — refresh Fresha availability
cron.schedule(settings.freshaWatcherCron, runFreshaWatcher, {
  timezone: settings.timezone,
  name: "fresha-watcher",
});

// Weekly Monday 9am — competitor & trend research
cron.schedule(settings.monitorAgentCron, runMonitor, {
  timezone: settings.timezone,
  name: "monitor",
});

// Weekly Monday 10am — campaign planning
cron.schedule(settings.campaignPlannerCron, () => runCampaignPlanner(), {
  timezone: settings.timezone,
  name: "campaign-planner",
});

console.log("✅ Scheduler running. Press Ctrl+C to stop.\n");
