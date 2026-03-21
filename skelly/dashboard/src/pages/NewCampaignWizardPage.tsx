import { Check, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    type Campaign,
    type MonitorProgress,
    type TrendsBrief,
    getCampaignPrompt,
    getLatestTrends,
    getMonitorSearchTerms,
    saveMonitorSearchTerms,
    streamMonitorWizard,
    suggestMonitorTerms,
    runCampaignWizard,
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

function BriefCard({ brief }: { brief: TrendsBrief | null }) {
    const [expanded, setExpanded] = useState(false);

    if (!brief) {
        return (
            <div className="mb-5 rounded-xl border border-warm-200 bg-warm-50 p-4">
                <p className="text-xs italic text-muted">No brief yet — run research to generate one.</p>
            </div>
        );
    }

    const weekLabel = (() => {
        try {
            return new Date(brief.weekOf).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            });
        } catch {
            return brief.weekOf;
        }
    })();

    const excerpt =
        brief.recommendedFocus.length > 120
            ? brief.recommendedFocus.slice(0, 120) + '…'
            : brief.recommendedFocus;

    return (
        <div className="mb-5 rounded-xl border border-warm-200 bg-warm-50 p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-muted">Current brief — week of {weekLabel}</p>
            </div>
            <p className="text-xs text-charcoal">{excerpt}</p>
            <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 text-xs font-semibold text-teal-700 hover:text-teal-400"
            >
                {expanded ? '▾ Hide full brief' : '▸ View full brief'}
            </button>
            {expanded && (
                <dl className="mt-3 space-y-2 text-xs">
                    {(
                        [
                            ['Competitor summary', brief.competitorSummary],
                            ['Trend signals', brief.trendSignals],
                            ['Seasonal factors', brief.seasonalFactors],
                            ['Opportunities', brief.opportunities],
                        ] as [string, string][]
                    ).map(([label, value]) => (
                        <div key={label}>
                            <dt className="font-semibold text-muted">{label}</dt>
                            <dd className="mt-0.5 text-charcoal">{value}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}

function MonitorStep({ onComplete }: { onComplete: () => void }) {
    const [terms, setTerms] = useState<string[]>([]);
    const [termsLoading, setTermsLoading] = useState(true);
    const [brief, setBrief] = useState<TrendsBrief | null>(null);
    const [briefLoading, setBriefLoading] = useState(true);
    const [saveAsDefaults, setSaveAsDefaults] = useState(false);
    const [state, setState] = useState<RunState>('idle');
    const [log, setLog] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const stopRef = useRef<(() => void) | null>(null);

    // AI suggest state
    const [suggesting, setSuggesting] = useState(false);
    const [suggestions, setSuggestions] = useState<string[] | null>(null);
    const [suggestError, setSuggestError] = useState<string | null>(null);

    useEffect(() => {
        getMonitorSearchTerms()
            .then(({ terms: t }) => setTerms(t))
            .catch(() => setTerms([]))
            .finally(() => setTermsLoading(false));

        getLatestTrends()
            .then(({ brief: b }) => setBrief(b))
            .catch(() => setBrief(null))
            .finally(() => setBriefLoading(false));
    }, []);

    function updateTerm(index: number, value: string) {
        setTerms((prev) => prev.map((t, i) => (i === index ? value : t)));
    }

    function removeTerm(index: number) {
        setTerms((prev) => prev.filter((_, i) => i !== index));
    }

    function addTerm() {
        setTerms((prev) => [...prev, '']);
    }

    async function handleSuggest() {
        setSuggesting(true);
        setSuggestError(null);
        setSuggestions(null);
        try {
            const { terms: suggested } = await suggestMonitorTerms();
            setSuggestions(suggested);
        } catch (err) {
            setSuggestError(err instanceof Error ? err.message : 'Failed to get suggestions');
        } finally {
            setSuggesting(false);
        }
    }

    async function handleRun() {
        const activeTerms = terms.filter((t) => t.trim());
        setState('running');
        setLog([]);
        setError(null);

        if (saveAsDefaults) {
            try {
                await saveMonitorSearchTerms(activeTerms);
            } catch {
                // non-fatal — continue with run
            }
        }

        const stop = streamMonitorWizard(activeTerms, {
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
                by the campaign planner. Review and adjust the search terms below before running.
            </p>

            {/* Current brief card */}
            {briefLoading ? (
                <div className="mb-5 h-12 w-full animate-pulse rounded-xl bg-warm-100" />
            ) : (
                <BriefCard brief={brief} />
            )}

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                </div>
            )}

            {/* Search terms list */}
            <div className="mb-4">
                <label className="mb-2 block text-xs font-medium text-muted">Search terms</label>
                {termsLoading ? (
                    <div className="h-24 w-full animate-pulse rounded-xl bg-warm-100" />
                ) : (
                    <div className="space-y-2">
                        {terms.map((term, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className="w-5 shrink-0 text-right text-xs font-semibold text-muted">{i + 1}.</span>
                                <input
                                    type="text"
                                    value={term}
                                    onChange={(e) => updateTerm(i, e.target.value)}
                                    disabled={state === 'running'}
                                    className="flex-1 rounded-xl border border-warm-200 bg-warm-50 px-3 py-2 text-xs text-charcoal focus:border-teal-400 focus:outline-none disabled:opacity-60"
                                />
                                <button
                                    onClick={() => removeTerm(i)}
                                    disabled={state === 'running'}
                                    className="rounded-lg p-1.5 text-muted transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                    title="Remove"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}

                        <div className="flex items-center gap-2 pt-1">
                            <button
                                onClick={addTerm}
                                disabled={state === 'running'}
                                className="flex items-center gap-1.5 rounded-lg border border-warm-200 bg-white px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-teal-400 hover:text-teal-700 disabled:opacity-40"
                            >
                                <Plus size={13} /> Add query
                            </button>
                            <button
                                onClick={() => void handleSuggest()}
                                disabled={suggesting || state === 'running'}
                                className="flex items-center gap-1.5 rounded-lg border border-warm-200 bg-white px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-teal-400 hover:text-teal-700 disabled:opacity-40"
                            >
                                {suggesting ? (
                                    <>
                                        <span className="h-3 w-3 animate-spin rounded-full border border-teal-400 border-t-transparent" />
                                        Suggesting…
                                    </>
                                ) : (
                                    'Suggest with AI'
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* AI suggestions panel */}
            {suggestError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {suggestError}
                </div>
            )}
            {suggestions && (
                <div className="mb-4 rounded-xl border border-warm-200 bg-warm-50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted">AI suggestions</p>
                        <button
                            onClick={() => setSuggestions(null)}
                            className="text-xs text-muted hover:text-charcoal"
                        >
                            ✕ Dismiss
                        </button>
                    </div>
                    <ul className="mb-3 space-y-1">
                        {suggestions.map((s, i) => (
                            <li key={i} className="text-xs text-charcoal">
                                {i + 1}. {s}
                            </li>
                        ))}
                    </ul>
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setTerms(suggestions); setSuggestions(null); }}
                            className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-600"
                        >
                            Replace all
                        </button>
                        <button
                            onClick={() => { setTerms((prev) => [...prev, ...suggestions]); setSuggestions(null); }}
                            className="rounded-lg border border-warm-200 bg-white px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-teal-400 hover:text-teal-700"
                        >
                            Add to list
                        </button>
                    </div>
                </div>
            )}

            <ProgressLog entries={log} state={state} />

            {/* Save as defaults checkbox */}
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                    type="checkbox"
                    checked={saveAsDefaults}
                    onChange={(e) => setSaveAsDefaults(e.target.checked)}
                    disabled={state === 'running'}
                    className="rounded border-warm-200"
                />
                Save as defaults before running
            </label>

            <div className="mt-4 flex items-center gap-3">
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
                            onClick={() => void handleRun()}
                            disabled={state === 'running' || termsLoading}
                            className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-600 disabled:opacity-50"
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
