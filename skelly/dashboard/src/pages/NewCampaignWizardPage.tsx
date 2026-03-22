import { Check, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    type AvailabilitySignal,
    type Campaign,
    type MonitorProgress,
    type ServiceInfo,
    type TrendsBrief,
    getLatestTrends,
    getMonitorSearchTerms,
    getSelectedCampaignServices,
    getServices,
    getSignals,
    runCampaignWizard,
    runFreshaWatcher,
    saveMonitorSearchTerms,
    saveSelectedCampaignServices,
    streamMonitorWizard,
    suggestMonitorTerms,
    updateTrendsBrief,
} from '../api/appApi';
import PageHeader from '../components/PageHeader';
import ServiceSelector from '../components/ServiceSelector';

// ── Utilities ─────────────────────────────────────────────────────────────────

function stripCites(text: string): string {
    return text.replace(/<\/?cite[^>]*>/g, '').replace(/\s{2,}/g, ' ').trim();
}

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
                                          : 'border-warm-200 text-muted border-2 bg-white'
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
        <div className="border-warm-200 bg-warm-50 mt-4 max-h-48 overflow-y-auto rounded-xl border px-4 py-3 font-mono text-xs">
            {entries.map((line, i) => (
                <p key={i} className="text-muted leading-relaxed">
                    {line}
                </p>
            ))}
            {state === 'running' && <p className="animate-pulse text-teal-700">Running…</p>}
            {state === 'done' && <p className="font-semibold text-green-600">✓ Done</p>}
            {state === 'error' && entries.length === 0 && <p className="text-red-600">An error occurred.</p>}
            <div ref={bottomRef} />
        </div>
    );
}

// ── Step 1 — Monitor ──────────────────────────────────────────────────────────

function BriefCard({ brief }: { brief: TrendsBrief | null }) {
    const [expanded, setExpanded] = useState(false);

    if (!brief) {
        return (
            <div className="border-warm-200 bg-warm-50 rounded-xl border p-4">
                <p className="text-muted text-xs italic">No brief yet — run research to generate one.</p>
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

    const clean = stripCites(brief.recommendedFocus);
    const excerpt = clean.length > 120 ? clean.slice(0, 120) + '…' : clean;

    return (
        <div>
            <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-muted text-xs font-semibold">Week of {weekLabel}</p>
            </div>
            <p className="text-charcoal text-xs">{excerpt}</p>
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
                            ['Competitor summary', stripCites(brief.competitorSummary)],
                            ['Trend signals', stripCites(brief.trendSignals)],
                            ['Seasonal factors', stripCites(brief.seasonalFactors)],
                            ['Opportunities', stripCites(brief.opportunities)],
                        ] as [string, string][]
                    ).map(([label, value]) => (
                        <div key={label}>
                            <dt className="text-muted font-semibold">{label}</dt>
                            <dd className="text-charcoal mt-0.5">{value}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}

// ── Editable brief panel ───────────────────────────────────────────────────────

const BRIEF_FIELDS: { key: keyof TrendsBrief; label: string; rows: number }[] = [
    { key: 'recommendedFocus', label: 'Recommended focus', rows: 3 },
    { key: 'competitorSummary', label: 'Competitor summary', rows: 3 },
    { key: 'trendSignals', label: 'Trend signals', rows: 3 },
    { key: 'seasonalFactors', label: 'Seasonal factors', rows: 2 },
    { key: 'opportunities', label: 'Opportunities', rows: 2 },
];

function EditableBriefPanel({ brief, onSaved }: { brief: TrendsBrief; onSaved: (updated: TrendsBrief) => void }) {
    const [fields, setFields] = useState({
        competitorSummary: stripCites(brief.competitorSummary),
        trendSignals: stripCites(brief.trendSignals),
        seasonalFactors: stripCites(brief.seasonalFactors),
        recommendedFocus: stripCites(brief.recommendedFocus),
        opportunities: stripCites(brief.opportunities),
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    async function handleSave() {
        setSaving(true);
        setSaved(false);
        setSaveError(null);
        try {
            const { brief: updated } = await updateTrendsBrief(brief.id, fields);
            onSaved(updated);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    }

    const weekLabel = (() => {
        try {
            return new Date(brief.weekOf).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
        } catch {
            return brief.weekOf;
        }
    })();

    return (
        <div>
            <p className="text-muted mb-3 text-[11px] font-semibold">Week of {weekLabel}</p>
            <div className="space-y-3">
                {BRIEF_FIELDS.map(({ key, label, rows }) => (
                    <div key={key}>
                        <label className="text-muted mb-1 block text-[11px] font-semibold uppercase tracking-wide">{label}</label>
                        <textarea
                            value={fields[key as keyof typeof fields]}
                            onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
                            rows={rows}
                            className="border-warm-200 bg-warm-50 text-charcoal w-full resize-none rounded-lg border px-2.5 py-2 text-xs focus:border-teal-400 focus:outline-none"
                        />
                    </div>
                ))}
            </div>
            {saveError && (
                <p className="mt-2 text-xs text-red-600">{saveError}</p>
            )}
            <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="mt-3 rounded-lg bg-teal-700 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-600 disabled:opacity-50"
            >
                {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save brief'}
            </button>
        </div>
    );
}

function MonitorStep({ onComplete }: { onComplete: () => void }) {
    const [terms, setTerms] = useState<string[]>([]);
    const [termsLoading, setTermsLoading] = useState(true);
    const [priorBrief, setPriorBrief] = useState<TrendsBrief | null>(null);
    const [newBrief, setNewBrief] = useState<TrendsBrief | null>(null);
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
            .then(({ brief: b }) => setPriorBrief(b))
            .catch(() => setPriorBrief(null))
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
                getLatestTrends()
                    .then(({ brief: b }) => setNewBrief(b))
                    .catch(() => {});
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
        <div className="grid grid-cols-2 gap-5">
            {/* Left: main step panel */}
            <div className="border-warm-200 rounded-2xl border bg-white p-6 shadow-sm">
                <p className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">
                    Step 1 · Market Research
                </p>
                <p className="text-charcoal mb-5 text-sm">
                    The monitor searches the web for competitor activity and Perth wellness trends, then saves a brief
                    used by the campaign planner. Review and adjust the search terms below before running.
                </p>

                {error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {error}
                    </div>
                )}

                {/* Search terms list */}
                <div className="mb-4">
                    <label className="text-muted mb-2 block text-xs font-medium">Search terms</label>
                    {termsLoading ? (
                        <div className="bg-warm-100 h-24 w-full animate-pulse rounded-xl" />
                    ) : (
                        <div className="space-y-2">
                            {terms.map((term, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <span className="text-muted mt-2 w-5 shrink-0 text-right text-xs font-semibold">
                                        {i + 1}.
                                    </span>
                                    <textarea
                                        value={term}
                                        onChange={(e) => updateTerm(i, e.target.value)}
                                        disabled={state === 'running'}
                                        rows={3}
                                        className="border-warm-200 bg-warm-50 text-charcoal flex-1 resize-none rounded-xl border px-3 py-2 text-xs focus:border-teal-400 focus:outline-none disabled:opacity-60"
                                    />
                                    <button
                                        onClick={() => removeTerm(i)}
                                        disabled={state === 'running'}
                                        className="text-muted mt-1.5 rounded-lg p-1.5 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
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
                                    className="border-warm-200 text-muted flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition hover:border-teal-400 hover:text-teal-700 disabled:opacity-40"
                                >
                                    <Plus size={13} /> Add query
                                </button>
                                <button
                                    onClick={() => void handleSuggest()}
                                    disabled={suggesting || state === 'running'}
                                    className="border-warm-200 text-muted flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition hover:border-teal-400 hover:text-teal-700 disabled:opacity-40"
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
                    <div className="border-warm-200 bg-warm-50 mb-4 rounded-xl border p-4">
                        <div className="mb-2 flex items-center justify-between">
                            <p className="text-muted text-xs font-semibold">AI suggestions</p>
                            <button
                                onClick={() => setSuggestions(null)}
                                className="text-muted hover:text-charcoal text-xs"
                            >
                                ✕ Dismiss
                            </button>
                        </div>
                        <ul className="mb-3 space-y-1">
                            {suggestions.map((s, i) => (
                                <li key={i} className="text-charcoal text-xs">
                                    {i + 1}. {s}
                                </li>
                            ))}
                        </ul>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setTerms(suggestions);
                                    setSuggestions(null);
                                }}
                                className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-600"
                            >
                                Replace all
                            </button>
                            <button
                                onClick={() => {
                                    setTerms((prev) => [...prev, ...suggestions]);
                                    setSuggestions(null);
                                }}
                                className="border-warm-200 text-muted rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition hover:border-teal-400 hover:text-teal-700"
                            >
                                Add to list
                            </button>
                        </div>
                    </div>
                )}

                <ProgressLog entries={log} state={state} />

                {/* Save as defaults checkbox */}
                <label className="text-muted mt-4 flex cursor-pointer items-center gap-2 text-xs">
                    <input
                        type="checkbox"
                        checked={saveAsDefaults}
                        onChange={(e) => setSaveAsDefaults(e.target.checked)}
                        disabled={state === 'running'}
                        className="border-warm-200 rounded"
                    />
                    Save as defaults before running
                </label>

                <div className="mt-4 flex items-center gap-3">
                    {state === 'done' ? (
                        <>
                            <button
                                onClick={handleRerun}
                                className="border-warm-200 text-muted rounded-lg border bg-white px-4 py-2 text-sm font-semibold transition hover:border-teal-400 hover:text-teal-700"
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
                                className="text-muted hover:text-charcoal text-sm font-semibold transition disabled:opacity-40"
                            >
                                Skip →
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Right: brief panel */}
            <div className="border-warm-200 rounded-2xl border bg-white p-6 shadow-sm">
                {newBrief ? (
                    <>
                        <p className="text-muted mb-3 text-xs font-semibold uppercase tracking-wide">New Brief</p>
                        <EditableBriefPanel brief={newBrief} onSaved={(updated) => setNewBrief(updated)} />
                        {priorBrief && priorBrief.id !== newBrief.id && (
                            <div className="mt-5 border-t border-warm-200 pt-5">
                                <p className="text-muted mb-3 text-xs font-semibold uppercase tracking-wide">Previous Brief</p>
                                <BriefCard brief={priorBrief} />
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <p className="text-muted mb-3 text-xs font-semibold uppercase tracking-wide">Current Brief</p>
                        {briefLoading ? (
                            <div className="space-y-2">
                                <div className="bg-warm-100 h-3 w-3/4 animate-pulse rounded" />
                                <div className="bg-warm-100 h-3 w-full animate-pulse rounded" />
                                <div className="bg-warm-100 h-3 w-5/6 animate-pulse rounded" />
                            </div>
                        ) : (
                            <BriefCard brief={priorBrief} />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ── Step 2 — Campaign Planner ─────────────────────────────────────────────────

function CampaignStep({ onComplete }: { onComplete: (campaign: Campaign) => void }) {
    const [ownerBrief, setOwnerBrief] = useState('');
    const [services, setServices] = useState<ServiceInfo[]>([]);
    const [servicesLoading, setServicesLoading] = useState(true);
    const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
    const [signals, setSignals] = useState<Record<string, AvailabilitySignal>>({});
    const [refreshing, setRefreshing] = useState(false);
    const [state, setState] = useState<RunState>('idle');
    const [error, setError] = useState<string | null>(null);
    const [campaign, setCampaign] = useState<Campaign | null>(null);

    useEffect(() => {
        Promise.all([
            getServices(),
            getSelectedCampaignServices(),
            getSignals(),
        ])
            .then(([{ services: s }, { services: saved }, { signals: sig }]) => {
                setServices(s);
                setSelectedServices(new Set(saved));
                setSignals(sig);
            })
            .catch(() => {})
            .finally(() => setServicesLoading(false));
    }, []);

    function toggleService(id: string) {
        setSelectedServices((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function handleRun() {
        setState('running');
        setError(null);
        setCampaign(null);
        void saveSelectedCampaignServices(selectedServices.size > 0 ? [...selectedServices] : []).catch(() => {});
        try {
            const result = await runCampaignWizard({
                ownerBrief: ownerBrief.trim() || undefined,
                selectedServices: selectedServices.size > 0 ? [...selectedServices] : undefined,
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
        setError(null);
        setCampaign(null);
    }

    async function handleRefreshFresha() {
        setRefreshing(true);
        try {
            await runFreshaWatcher();
            const { signals: sig } = await getSignals();
            setSignals(sig);
        } catch {
            // non-fatal
        } finally {
            setRefreshing(false);
        }
    }

    return (
        <div className="border-warm-200 rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">Step 2 · Campaign Plan</p>
            <p className="text-charcoal mb-5 text-sm">
                Select the services to promote in this campaign, then add any additional guidance below.
            </p>

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                </div>
            )}

            {/* Service selector */}
            <div className="mb-5">
                <ServiceSelector
                    services={services}
                    selected={selectedServices}
                    signals={signals}
                    loading={servicesLoading}
                    disabled={state === 'running'}
                    hint="leave empty to use Fresha booking signals"
                    showFresha
                    refreshing={refreshing}
                    onToggle={toggleService}
                    onToggleGroup={(ids, allSelected) => {
                        setSelectedServices((prev) => {
                            const next = new Set(prev);
                            if (allSelected) ids.forEach((id) => next.delete(id));
                            else ids.forEach((id) => next.add(id));
                            return next;
                        });
                    }}
                    onSelectPush={() => {
                        const pushIds = Object.values(signals)
                            .filter((s) => s.signal === 'push')
                            .map((s) => s.serviceId);
                        setSelectedServices(new Set(pushIds));
                    }}
                    onClear={() => setSelectedServices(new Set())}
                    onRefreshFresha={() => void handleRefreshFresha()}
                />
            </div>

            <div className="mb-5">
                <label className="text-muted mb-1.5 block text-xs font-medium">
                    Additional guidance <span className="font-normal">(optional)</span>
                </label>
                <textarea
                    value={ownerBrief}
                    onChange={(e) => setOwnerBrief(e.target.value)}
                    disabled={state === 'running'}
                    placeholder="e.g. Focus on the new recovery massage package launching next week…"
                    rows={3}
                    className="border-warm-200 bg-warm-50 text-charcoal placeholder:text-muted w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:border-teal-400 focus:outline-none disabled:opacity-60"
                />
            </div>

            {state === 'running' && (
                <div className="border-warm-200 bg-warm-50 mb-5 flex items-center gap-3 rounded-xl border px-4 py-3">
                    <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                    <p className="text-muted text-xs">Generating campaign — this may take 30–60 seconds…</p>
                </div>
            )}

            {state === 'done' && campaign && (
                <div className="mb-5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
                    <p className="text-xs font-semibold text-teal-700">✓ Campaign generated</p>
                    <p className="text-charcoal mt-0.5 text-sm font-semibold">{campaign.title}</p>
                    {campaign.description && <p className="text-muted mt-1 text-xs">{campaign.description}</p>}
                </div>
            )}

            <div className="flex items-center gap-3">
                {state === 'done' && campaign ? (
                    <>
                        <button
                            onClick={handleRerun}
                            className="border-warm-200 text-muted rounded-lg border bg-white px-4 py-2 text-sm font-semibold transition hover:border-teal-400 hover:text-teal-700"
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
                        disabled={state === 'running' || servicesLoading}
                        className="text-charcoal rounded-lg bg-teal-400 px-5 py-2 text-sm font-semibold transition hover:brightness-110 disabled:opacity-50"
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

            <div className={`mx-auto`}>
                <Stepper current={step} />

                {step === 1 && <MonitorStep onComplete={handleMonitorDone} />}
                {step === 2 && <CampaignStep onComplete={handleCampaignDone} />}
            </div>
        </>
    );
}
