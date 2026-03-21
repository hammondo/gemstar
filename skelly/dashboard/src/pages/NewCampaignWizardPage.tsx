import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    type Campaign,
    type MonitorProgress,
    getCampaignPrompt,
    getMonitorPrompt,
    runCampaignWizard,
    streamMonitorWizard,
} from '../api/appApi';
import PageHeader from '../components/PageHeader';

// ── Types ─────────────────────────────────────────────────────────────────────

type RunState = 'idle' | 'running' | 'done' | 'error';

// ── Stepper ───────────────────────────────────────────────────────────────────

const STEPS = ['Research', 'Plan', 'Review'];

function Stepper({ current }: { current: 1 | 2 | 3 }) {
    return (
        <div className="mb-8 flex items-center gap-0">
            {STEPS.map((label, i) => {
                const n = i + 1;
                const done = n < current;
                const active = n === current;
                return (
                    <div key={label} className="flex items-center">
                        <div className="flex flex-col items-center gap-1">
                            <div
                                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                                    done
                                        ? 'bg-teal-700 text-white'
                                        : active
                                          ? 'border-2 border-teal-700 bg-white text-teal-700'
                                          : 'border-2 border-warm-200 bg-white text-muted'
                                }`}
                            >
                                {done ? <Check size={14} strokeWidth={2.5} /> : n}
                            </div>
                            <span
                                className={`text-[11px] font-semibold ${active ? 'text-teal-700' : done ? 'text-charcoal' : 'text-muted'}`}
                            >
                                {label}
                            </span>
                        </div>
                        {i < STEPS.length - 1 && (
                            <div
                                className={`mb-4 h-0.5 w-16 transition-colors ${n < current ? 'bg-teal-700' : 'bg-warm-200'}`}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── Progress log ──────────────────────────────────────────────────────────────

function ProgressLog({ entries, state }: { entries: string[]; state: RunState }) {
    const bottomRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [entries]);

    if (entries.length === 0 && state === 'idle') return null;

    return (
        <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-warm-200 bg-warm-50 px-4 py-3 font-mono text-xs">
            {entries.map((line, i) => (
                <p key={i} className="leading-relaxed text-muted">
                    {line}
                </p>
            ))}
            {state === 'running' && (
                <p className="animate-pulse text-teal-700">Running…</p>
            )}
            {state === 'done' && (
                <p className="font-semibold text-green-600">✓ Done</p>
            )}
            {state === 'error' && entries.length === 0 && (
                <p className="text-red-600">An error occurred.</p>
            )}
            <div ref={bottomRef} />
        </div>
    );
}

// ── Step 1 — Monitor ──────────────────────────────────────────────────────────

function MonitorStep({ onComplete }: { onComplete: () => void }) {
    const [prompt, setPrompt] = useState('');
    const [promptLoading, setPromptLoading] = useState(true);
    const [state, setState] = useState<RunState>('idle');
    const [log, setLog] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const stopRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        getMonitorPrompt()
            .then(({ prompt: p }) => setPrompt(p))
            .catch(() => setPrompt(''))
            .finally(() => setPromptLoading(false));
    }, []);

    function handleRun() {
        setState('running');
        setLog([]);
        setError(null);

        const stop = streamMonitorWizard(prompt, {
            onProgress(data: MonitorProgress) {
                if (data.type === 'status' || data.type === 'done') {
                    setLog((prev) => [...prev, data.message]);
                }
            },
            onComplete() {
                setState('done');
                stopRef.current = null;
            },
            onError(err) {
                setState('error');
                setError(err);
                stopRef.current = null;
            },
        });
        stopRef.current = stop;
    }

    function handleRerun() {
        setState('idle');
        setLog([]);
        setError(null);
    }

    return (
        <div className="rounded-2xl border border-warm-200 bg-white p-6 shadow-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Step 1 · Market Research</p>
            <p className="mb-5 text-sm text-charcoal">
                The monitor searches the web for competitor activity and Perth wellness trends, then saves a brief used
                by the campaign planner. Review and adjust the research prompt below before running.
            </p>

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                </div>
            )}

            <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-muted">Research prompt</label>
                {promptLoading ? (
                    <div className="h-48 w-full animate-pulse rounded-xl bg-warm-100" />
                ) : (
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        disabled={state === 'running'}
                        rows={12}
                        className="w-full resize-y rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 font-mono text-xs text-charcoal focus:border-teal-400 focus:outline-none disabled:opacity-60"
                    />
                )}
            </div>

            <ProgressLog entries={log} state={state} />

            <div className="mt-5 flex items-center gap-3">
                {state === 'done' ? (
                    <>
                        <button
                            onClick={handleRerun}
                            className="rounded-lg border border-warm-200 bg-white px-4 py-2 text-sm font-semibold text-muted transition hover:border-teal-400 hover:text-teal-700"
                        >
                            Re-run
                        </button>
                        <button
                            onClick={onComplete}
                            className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-600"
                        >
                            Continue to Campaign Plan →
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            onClick={handleRun}
                            disabled={state === 'running' || promptLoading}
                            className="rounded-lg bg-teal-400 px-5 py-2 text-sm font-semibold text-charcoal transition hover:brightness-110 disabled:opacity-50"
                        >
                            {state === 'running' ? 'Running…' : 'Run Research'}
                        </button>
                        <button
                            onClick={onComplete}
                            disabled={state === 'running'}
                            className="text-sm font-semibold text-muted transition hover:text-charcoal disabled:opacity-40"
                        >
                            Skip →
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

// ── Step 2 — Campaign Planner ─────────────────────────────────────────────────

function CampaignStep({ onComplete }: { onComplete: (campaign: Campaign) => void }) {
    const [ownerBrief, setOwnerBrief] = useState('');
    const [prompt, setPrompt] = useState('');
    const [promptLoading, setPromptLoading] = useState(true);
    const [showPrompt, setShowPrompt] = useState(false);
    const [state, setState] = useState<RunState>('idle');
    const [statusMsg, setStatusMsg] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [campaign, setCampaign] = useState<Campaign | null>(null);

    useEffect(() => {
        getCampaignPrompt()
            .then(({ prompt: p }) => setPrompt(p))
            .catch(() => setPrompt(''))
            .finally(() => setPromptLoading(false));
    }, []);

    async function handleRun() {
        setState('running');
        setStatusMsg('Generating campaign — this may take 30–60 seconds…');
        setError(null);
        setCampaign(null);
        try {
            const result = await runCampaignWizard({
                ownerBrief: ownerBrief.trim() || undefined,
                customPrompt: showPrompt && prompt.trim() ? prompt.trim() : undefined,
            });
            setCampaign(result.campaign);
            setState('done');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate campaign');
            setState('error');
        }
    }

    function handleRerun() {
        setState('idle');
        setStatusMsg('');
        setError(null);
        setCampaign(null);
        // Reload prompt so it picks up the latest trends brief
        setPromptLoading(true);
        getCampaignPrompt()
            .then(({ prompt: p }) => setPrompt(p))
            .catch(() => {})
            .finally(() => setPromptLoading(false));
    }

    return (
        <div className="rounded-2xl border border-warm-200 bg-white p-6 shadow-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Step 2 · Campaign Plan</p>
            <p className="mb-5 text-sm text-charcoal">
                The campaign planner uses the latest trends brief and Fresha booking signals to generate a 4-week
                campaign. Add your own brief below to steer the focus.
            </p>

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                </div>
            )}

            <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-muted">
                    Owner brief <span className="font-normal">(optional)</span>
                </label>
                <textarea
                    value={ownerBrief}
                    onChange={(e) => setOwnerBrief(e.target.value)}
                    disabled={state === 'running'}
                    placeholder="e.g. Focus on the new recovery massage package launching next week…"
                    rows={3}
                    className="w-full resize-none rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 text-sm text-charcoal placeholder:text-muted focus:border-teal-400 focus:outline-none disabled:opacity-60"
                />
            </div>

            <div className="mb-5">
                <button
                    onClick={() => setShowPrompt((v) => !v)}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-400"
                >
                    {showPrompt ? '▾ Hide full prompt' : '▸ Edit full prompt'}
                </button>
                {showPrompt && (
                    <div className="mt-2">
                        {promptLoading ? (
                            <div className="h-48 w-full animate-pulse rounded-xl bg-warm-100" />
                        ) : (
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                disabled={state === 'running'}
                                rows={16}
                                className="w-full resize-y rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 font-mono text-xs text-charcoal focus:border-teal-400 focus:outline-none disabled:opacity-60"
                            />
                        )}
                        <p className="mt-1 text-xs text-muted">
                            When the full prompt is visible, it overrides the owner brief above.
                        </p>
                    </div>
                )}
            </div>

            {state === 'running' && (
                <div className="mb-5 flex items-center gap-3 rounded-xl border border-warm-200 bg-warm-50 px-4 py-3">
                    <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                    <p className="text-xs text-muted">{statusMsg}</p>
                </div>
            )}

            {state === 'done' && campaign && (
                <div className="mb-5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
                    <p className="text-xs font-semibold text-teal-700">✓ Campaign generated</p>
                    <p className="mt-0.5 text-sm font-semibold text-charcoal">{campaign.title}</p>
                    {campaign.description && (
                        <p className="mt-1 text-xs text-muted">{campaign.description}</p>
                    )}
                </div>
            )}

            <div className="flex items-center gap-3">
                {state === 'done' && campaign ? (
                    <>
                        <button
                            onClick={handleRerun}
                            className="rounded-lg border border-warm-200 bg-white px-4 py-2 text-sm font-semibold text-muted transition hover:border-teal-400 hover:text-teal-700"
                        >
                            Re-generate
                        </button>
                        <button
                            onClick={() => onComplete(campaign)}
                            className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-600"
                        >
                            Review Campaign →
                        </button>
                    </>
                ) : (
                    <button
                        onClick={() => void handleRun()}
                        disabled={state === 'running' || promptLoading}
                        className="rounded-lg bg-teal-400 px-5 py-2 text-sm font-semibold text-charcoal transition hover:brightness-110 disabled:opacity-50"
                    >
                        {state === 'running' ? 'Generating…' : 'Generate Campaign'}
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewCampaignWizardPage() {
    const navigate = useNavigate();
    const [step, setStep] = useState<1 | 2 | 3>(1);

    function handleMonitorDone() {
        setStep(2);
    }

    function handleCampaignDone(campaign: Campaign) {
        void navigate(`/campaigns/${campaign.id}`);
    }

    return (
        <>
            <PageHeader title="New Campaign" subtitle="Research trends, then generate a campaign plan" />

            <div className="mx-auto max-w-2xl">
                <Stepper current={step} />

                {step === 1 && <MonitorStep onComplete={handleMonitorDone} />}
                {step === 2 && <CampaignStep onComplete={handleCampaignDone} />}
            </div>
        </>
    );
}
