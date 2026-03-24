import { useRef, useState } from 'react';
import {
    type MonitorProgress,
    importFreshaCsv,
    runAll,
    runCampaignPlanner,
    runFreshaWatcher,
    scheduleCampaigns,
    streamMonitor,
} from '../api/appApi';
import PageHeader from '../components/PageHeader';

// ── Types ─────────────────────────────────────────────────────────────────────

type RunState = 'idle' | 'running' | 'done' | 'error';

interface AgentState {
    state: RunState;
    log: string[];
    error?: string;
}

function fresh(): AgentState {
    return { state: 'idle', log: [] };
}

// ── Small components ──────────────────────────────────────────────────────────

function StatusDot({ state }: { state: RunState }) {
    const cls =
        state === 'running' ? 'animate-pulse bg-teal-400' :
        state === 'done'    ? 'bg-green-500' :
        state === 'error'   ? 'bg-red-500' :
                              'bg-warm-200';
    return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}

function AgentCard({
    title,
    description,
    agent,
    onRun,
    disabled,
    children,
}: {
    title: string;
    description: string;
    agent: AgentState;
    onRun: () => void;
    disabled?: boolean;
    children?: React.ReactNode;
}) {
    const logRef = useRef<HTMLDivElement>(null);

    return (
        <div className="rounded-2xl border border-warm-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-warm-200 px-6 py-4">
                <div className="flex items-center gap-2.5">
                    <StatusDot state={agent.state} />
                    <div>
                        <h3 className="text-sm font-semibold text-charcoal">{title}</h3>
                        <p className="text-xs text-muted">{description}</p>
                    </div>
                </div>
                <button
                    onClick={onRun}
                    disabled={disabled || agent.state === 'running'}
                    className="shrink-0 rounded-lg bg-teal-400 px-4 py-1.5 text-xs font-semibold text-charcoal transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {agent.state === 'running' ? 'Running…' : 'Run'}
                </button>
            </div>

            {children && <div className="border-b border-warm-200 px-6 py-4">{children}</div>}

            {(agent.log.length > 0 || agent.error) && (
                <div
                    ref={logRef}
                    className="max-h-48 overflow-y-auto px-6 py-3 font-mono text-xs"
                >
                    {agent.error && (
                        <p className="text-red-600">Error: {agent.error}</p>
                    )}
                    {agent.log.map((line, i) => (
                        <p key={i} className="text-muted leading-relaxed">{line}</p>
                    ))}
                    {agent.state === 'done' && !agent.error && (
                        <p className="text-green-600 font-semibold">✓ Done</p>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
    const [ownerBrief, setOwnerBrief] = useState('');
    const [freshaFile, setFreshaFile] = useState<File | null>(null);

    const [fresha,   setFresha]   = useState<AgentState>(fresh);
    const [monitor,  setMonitor]  = useState<AgentState>(fresh);
    const [campaign, setCampaign] = useState<AgentState>(fresh);
    const [all,      setAll]      = useState<AgentState>(fresh);
    const [schedule, setSchedule] = useState<AgentState>(fresh);
    const [csvImport, setCsvImport] = useState<AgentState>(fresh);

    const stopMonitorRef = useRef<(() => void) | null>(null);

    // ── Handlers ──────────────────────────────────────────────────────────────

    async function handleFresha() {
        setFresha({ state: 'running', log: ['Starting Fresha watcher…'] });
        try {
            await runFreshaWatcher();
            setFresha({ state: 'done', log: ['Fresha watcher completed.'] });
        } catch (err) {
            setFresha({ state: 'error', log: [], error: (err as Error).message });
        }
    }

    function handleMonitor() {
        setMonitor({ state: 'running', log: ['Connecting to monitor stream…'] });

        const stop = streamMonitor({
            onProgress(data: MonitorProgress) {
                setMonitor((prev) => ({
                    ...prev,
                    log: [...prev.log, data.message ?? JSON.stringify(data)],
                }));
            },
            onComplete() {
                setMonitor((prev) => ({ ...prev, state: 'done' }));
                stopMonitorRef.current = null;
            },
            onError(error) {
                setMonitor((prev) => ({ ...prev, state: 'error', error }));
                stopMonitorRef.current = null;
            },
        });

        stopMonitorRef.current = stop;
    }

    async function handleCampaign() {
        setCampaign({ state: 'running', log: ['Starting campaign planner…'] });
        try {
            await runCampaignPlanner(ownerBrief || undefined);
            setCampaign({ state: 'done', log: ['Campaign planner completed.'] });
        } catch (err) {
            setCampaign({ state: 'error', log: [], error: (err as Error).message });
        }
    }

    async function handleAll() {
        setAll({ state: 'running', log: ['Starting full pipeline…'] });
        try {
            await runAll(ownerBrief || undefined);
            setAll({ state: 'done', log: ['Full pipeline completed.'] });
        } catch (err) {
            setAll({ state: 'error', log: [], error: (err as Error).message });
        }
    }

    async function handleSchedule() {
        setSchedule({ state: 'running', log: ['Queueing approved campaigns…'] });
        try {
            await scheduleCampaigns();
            setSchedule({ state: 'done', log: ['Campaigns queued for publishing.'] });
        } catch (err) {
            setSchedule({ state: 'error', log: [], error: (err as Error).message });
        }
    }

    async function handleCsvImport() {
        if (!freshaFile) return;
        setCsvImport({ state: 'running', log: [`Importing ${freshaFile.name}…`] });
        try {
            const csvContent = await freshaFile.text();
            await importFreshaCsv(csvContent, freshaFile.name);
            setCsvImport({ state: 'done', log: [`Imported ${freshaFile.name}.`] });
        } catch (err) {
            setCsvImport({ state: 'error', log: [], error: (err as Error).message });
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    const anyRunning = [fresha, monitor, campaign, all, schedule, csvImport].some(
        (a) => a.state === 'running',
    );

    return (
        <>
            <PageHeader title="Agents" subtitle="Manually trigger pipeline steps" />

            <div className="space-y-4">
                {/* Owner brief — shared by Campaign Planner and Run All */}
                <div className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
                    <label className="mb-1.5 block text-xs font-semibold text-charcoal">
                        Owner brief <span className="font-normal text-muted">(optional — used by Campaign Planner and Run All)</span>
                    </label>
                    <textarea
                        value={ownerBrief}
                        onChange={(e) => setOwnerBrief(e.target.value)}
                        placeholder="e.g. Focus on the new recovery massage package launching next week…"
                        rows={3}
                        className="w-full resize-none rounded-xl border border-warm-200 bg-warm-50 px-3 py-2 text-sm text-charcoal placeholder:text-muted focus:border-teal-400 focus:outline-none"
                    />
                </div>

                <AgentCard
                    title="Fresha Watcher"
                    description="Checks appointment availability and updates push / hold / pause signals."
                    agent={fresha}
                    onRun={() => void handleFresha()}
                    disabled={anyRunning}
                />

                <AgentCard
                    title="Monitor"
                    description="Scans competitor activity and market trends. Streams live progress."
                    agent={monitor}
                    onRun={handleMonitor}
                    disabled={anyRunning}
                />

                <AgentCard
                    title="Campaign Planner"
                    description="Generates new campaigns based on availability signals and trends."
                    agent={campaign}
                    onRun={() => void handleCampaign()}
                    disabled={anyRunning}
                />

                <AgentCard
                    title="Run All"
                    description="Runs the full pipeline: Fresha watcher → monitor → campaign planner."
                    agent={all}
                    onRun={() => void handleAll()}
                    disabled={anyRunning}
                />

                <AgentCard
                    title="Queue Approved Campaigns"
                    description="Schedules all approved campaigns for publishing via Postiz."
                    agent={schedule}
                    onRun={() => void handleSchedule()}
                    disabled={anyRunning}
                />

                <AgentCard
                    title="Import Fresha CSV"
                    description="Manually upload a Fresha appointments export to update availability signals."
                    agent={csvImport}
                    onRun={() => void handleCsvImport()}
                    disabled={anyRunning || !freshaFile}
                >
                    <div className="flex items-center gap-3">
                        <label className="cursor-pointer rounded-lg border border-warm-200 bg-warm-50 px-3 py-1.5 text-xs font-medium text-charcoal transition hover:bg-warm-100">
                            {freshaFile ? freshaFile.name : 'Choose CSV file'}
                            <input
                                type="file"
                                accept=".csv"
                                className="sr-only"
                                onChange={(e) => setFreshaFile(e.target.files?.[0] ?? null)}
                            />
                        </label>
                        {freshaFile && (
                            <button
                                onClick={() => setFreshaFile(null)}
                                className="text-xs text-muted hover:text-charcoal"
                            >
                                Remove
                            </button>
                        )}
                    </div>
                </AgentCard>
            </div>
        </>
    );
}
