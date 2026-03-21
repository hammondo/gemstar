import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type BodyspaceStatus, getBodyspaceStatus, getHealth, getMonitorSearchTerms, saveMonitorSearchTerms } from '../api/appApi';
import PageHeader from '../components/PageHeader';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function describeCron(expr: string): string {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return expr;
    const [min, hour, dom, , dow] = parts;

    const timeStr = (h: string, m: string) => {
        const hNum = parseInt(h, 10);
        const mNum = parseInt(m, 10);
        if (isNaN(hNum) || isNaN(mNum)) return null;
        const suffix = hNum >= 12 ? 'pm' : 'am';
        const h12 = hNum % 12 === 0 ? 12 : hNum % 12;
        return mNum === 0 ? `${h12}:00 ${suffix}` : `${h12}:${String(mNum).padStart(2, '0')} ${suffix}`;
    };

    const time = timeStr(hour, min);
    if (!time) return expr;

    // Specific day of week
    if (dow !== '*') {
        const dayNums = dow.split(',').map((d) => parseInt(d, 10));
        const dayNames = dayNums.map((n) => DOW[n] ?? String(n));
        const dayLabel = dayNames.length === 1 ? `every ${dayNames[0]}` : `every ${dayNames.join(', ')}`;
        return `${dayLabel} at ${time}`;
    }

    // Specific day of month
    if (dom !== '*') {
        const d = parseInt(dom, 10);
        const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
        return `monthly on the ${d}${suffix} at ${time}`;
    }

    return `every day at ${time}`;
}

export default function SettingsPage() {
    const [health, setHealth] = useState<{ status: string; service: string; timestamp: string } | null>(null);
    const [bsStatus, setBsStatus] = useState<BodyspaceStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Monitor search terms
    const [terms, setTerms] = useState<string[]>([]);
    const [termsSaving, setTermsSaving] = useState(false);
    const [termsSaved, setTermsSaved] = useState(false);
    const [termsError, setTermsError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([getHealth(), getBodyspaceStatus(), getMonitorSearchTerms()])
            .then(([h, s, { terms: t }]) => {
                setHealth(h);
                setBsStatus(s);
                setTerms(t);
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
            .finally(() => setLoading(false));
    }, []);

    async function handleSaveTerms() {
        setTermsSaving(true);
        setTermsSaved(false);
        setTermsError(null);
        try {
            const { terms: saved } = await saveMonitorSearchTerms(terms.filter((t) => t.trim()));
            setTerms(saved);
            setTermsSaved(true);
            setTimeout(() => setTermsSaved(false), 2500);
        } catch (err) {
            setTermsError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setTermsSaving(false);
        }
    }

    function updateTerm(index: number, value: string) {
        setTerms((prev) => prev.map((t, i) => (i === index ? value : t)));
    }

    function removeTerm(index: number) {
        setTerms((prev) => prev.filter((_, i) => i !== index));
    }

    function addTerm() {
        setTerms((prev) => [...prev, '']);
    }

    return (
        <>
            <PageHeader title="Settings" subtitle="System status and schedule configuration" />

            {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="space-y-5">
                <div className="grid grid-cols-2 gap-5">
                    {/* API health */}
                    <div className="rounded-2xl border border-warm-200 bg-white p-6 shadow-sm">
                        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">API health</p>
                        {loading ? (
                            <p className="text-sm text-muted">Loading…</p>
                        ) : health ? (
                            <div className="flex flex-wrap items-center gap-3">
                                <span
                                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                                        health.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
                                    }`}
                                />
                                <span className="text-sm font-semibold text-charcoal capitalize">{health.status}</span>
                                <span className="text-xs text-muted">{health.service}</span>
                                <span className="ml-auto text-xs text-muted">
                                    {new Date(health.timestamp).toLocaleString()}
                                </span>
                            </div>
                        ) : (
                            <p className="text-sm text-red-600">Unavailable</p>
                        )}
                    </div>

                    {/* Cron schedules */}
                    <div className="rounded-2xl border border-warm-200 bg-white p-6 shadow-sm">
                        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">Cron schedules</p>
                        {loading ? (
                            <p className="text-sm text-muted">Loading…</p>
                        ) : bsStatus?.schedules ? (
                            <dl className="space-y-3">
                                {bsStatus.timezone && (
                                    <div className="flex items-baseline justify-between gap-4 border-b border-warm-100 pb-3">
                                        <dt className="text-xs font-medium text-muted">Timezone</dt>
                                        <dd className="text-sm font-semibold text-charcoal">{bsStatus.timezone}</dd>
                                    </div>
                                )}
                                {([
                                    ['Fresha watcher', bsStatus.schedules.freshaWatcher],
                                    ['Monitor', bsStatus.schedules.monitor],
                                    ['Campaign planner', bsStatus.schedules.campaignPlanner],
                                ] as [string, string][]).map(([label, expr]) => (
                                    <div key={label} className="flex items-baseline justify-between gap-4">
                                        <dt className="text-xs font-medium text-muted">{label}</dt>
                                        <dd className="text-right">
                                            <span className="text-sm text-charcoal">{describeCron(expr)}</span>
                                            <span className="ml-2 font-mono text-xs text-muted">({expr})</span>
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        ) : (
                            <p className="text-sm text-muted">No schedule information available.</p>
                        )}
                    </div>
                </div>

                {/* Monitor search terms */}
                <div className="rounded-2xl border border-warm-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Market research queries</p>
                            <p className="mt-0.5 text-xs text-muted">Search terms used by the Monitor agent when researching trends and competitors.</p>
                        </div>
                    </div>

                    {termsError && (
                        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{termsError}</p>
                    )}

                    {loading ? (
                        <p className="text-sm text-muted">Loading…</p>
                    ) : (
                        <div className="space-y-2">
                            {terms.map((term, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <span className="mt-2.5 w-5 shrink-0 text-right text-xs font-semibold text-muted">{i + 1}.</span>
                                    <textarea
                                        value={term}
                                        onChange={(e) => updateTerm(i, e.target.value)}
                                        rows={2}
                                        className="flex-1 resize-none rounded-xl border border-warm-200 bg-warm-50 px-3 py-2 text-xs text-charcoal focus:border-teal-400 focus:outline-none"
                                    />
                                    <button
                                        onClick={() => removeTerm(i)}
                                        className="mt-1.5 rounded-lg p-1.5 text-muted transition hover:bg-red-50 hover:text-red-600"
                                        title="Remove"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}

                            <div className="flex items-center justify-between pt-2">
                                <button
                                    onClick={addTerm}
                                    className="flex items-center gap-1.5 rounded-lg border border-warm-200 bg-white px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-teal-400 hover:text-teal-700"
                                >
                                    <Plus size={13} /> Add query
                                </button>
                                <button
                                    onClick={() => void handleSaveTerms()}
                                    disabled={termsSaving}
                                    className="rounded-lg bg-teal-700 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-600 disabled:opacity-50"
                                >
                                    {termsSaving ? 'Saving…' : termsSaved ? 'Saved ✓' : 'Save'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </>
    );
}
