import { useEffect, useRef, useState } from 'react';

function stripCiteTags(text: string): string {
    return text.replace(/<\/?cite[^>]*>/gi, '');
}
import { type MonitorProgress, type ServiceAvailability, type TrendsBrief, getLatestTrends, getSignals, runFreshaWatcher, streamMonitor } from '../api/appApi';
import Badge from '../components/Badge';
import PageHeader from '../components/PageHeader';

export default function SignalsPage() {
    const [signals, setSignals] = useState<Record<string, ServiceAvailability>>({});
    const [trends, setTrends] = useState<TrendsBrief | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [runningFresha, setRunningFresha] = useState(false);
    const [runningMonitor, setRunningMonitor] = useState(false);
    const [monitorLog, setMonitorLog] = useState<string[]>([]);
    const stopMonitorRef = useRef<(() => void) | null>(null);
    const logContainerRef = useRef<HTMLDivElement>(null);

    function loadData() {
        return Promise.all([getSignals(), getLatestTrends()])
            .then(([{ signals: s }, { brief }]) => {
                setSignals(s);
                setTrends(brief);
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
            .finally(() => setLoading(false));
    }

    useEffect(() => { loadData(); }, []);

    async function handleRunFresha() {
        setRunningFresha(true);
        setError(null);
        try {
            await runFreshaWatcher();
            setLoading(true);
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to run Fresha watcher');
        } finally {
            setRunningFresha(false);
        }
    }

    function handleRunMonitor() {
        setRunningMonitor(true);
        setError(null);
        setMonitorLog(['Connecting…']);

        const stop = streamMonitor({
            onProgress(data: MonitorProgress) {
                setMonitorLog((prev) => [...prev, data.message ?? JSON.stringify(data)]);
                if (logContainerRef.current) {
                    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                }
            },
            onComplete() {
                stopMonitorRef.current = null;
                setRunningMonitor(false);
                setLoading(true);
                loadData();
            },
            onError(err) {
                stopMonitorRef.current = null;
                setRunningMonitor(false);
                setError(err ?? 'Monitor agent failed');
            },
        });

        stopMonitorRef.current = stop;
    }

    const signalList = Object.values(signals).sort((a, b) =>
        a.serviceName.localeCompare(b.serviceName),
    );

    return (
        <>
            <PageHeader title="Signals" subtitle="Availability signals and market trends" />

            {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Availability signals */}
                <section className="rounded-2xl border border-warm-200 bg-white shadow-sm overflow-hidden">
                    <div className="border-b border-warm-200 px-6 py-4 flex items-center justify-between gap-4">
                        <div>
                            <h2 className="text-sm font-semibold text-charcoal">Availability signals</h2>
                            <p className="mt-0.5 text-xs text-muted">Fresha slot data driving campaign decisions</p>
                        </div>
                        <button
                            onClick={handleRunFresha}
                            disabled={runningFresha}
                            className="shrink-0 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {runningFresha ? 'Updating…' : 'Update signals'}
                        </button>
                    </div>

                    {loading ? (
                        <div className="px-6 py-10 text-center text-sm text-muted">Loading…</div>
                    ) : signalList.length === 0 ? (
                        <div className="px-6 py-10 text-center text-sm text-muted">No signals recorded yet.</div>
                    ) : (
                        <ul className="divide-y divide-warm-200">
                            {signalList.map((s) => (
                                <li key={s.serviceId} className="flex items-start justify-between gap-4 px-6 py-3.5">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-charcoal">{s.serviceName}</p>
                                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
                                            <span>{s.availableSlots} available</span>
                                            {s.bookedSlots != null && <span>{s.bookedSlots} booked</span>}
                                            {s.totalSlots != null && <span>{s.totalSlots} capacity</span>}
                                            <span className="text-green-600">push ≥{s.pushThreshold}</span>
                                            <span className="text-red-500">pause ≤{s.pauseThreshold}</span>
                                        </div>
                                    </div>
                                    <Badge value={s.signal} />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* Trends brief */}
                <section className="rounded-2xl border border-warm-200 bg-white shadow-sm">
                    <div className="border-b border-warm-200 px-6 py-4 flex items-center justify-between gap-4">
                        <div>
                            <h2 className="text-sm font-semibold text-charcoal">Latest trends brief</h2>
                            <p className="mt-0.5 text-xs text-muted">AI-generated market analysis</p>
                        </div>
                        <button
                            onClick={handleRunMonitor}
                            disabled={runningMonitor}
                            className="shrink-0 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {runningMonitor ? 'Updating…' : 'Update brief'}
                        </button>
                    </div>
                    <div className="p-6">
                        {runningMonitor ? (
                            <div ref={logContainerRef} className="rounded-lg bg-warm-50 p-3 font-mono text-xs text-charcoal max-h-64 overflow-y-auto">
                                {monitorLog.map((line, i) => (
                                    <p key={i} className="leading-relaxed">{line}</p>
                                ))}
                            </div>
                        ) : loading ? (
                            <p className="text-sm text-muted">Loading…</p>
                        ) : !trends ? (
                            <p className="text-sm text-muted">No trends brief available yet.</p>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs text-muted">Week of {trends.weekOf}</p>
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                        trends.confidence === 'high' ? 'bg-green-100 text-green-700' :
                                        trends.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                                        'bg-red-100 text-red-700'
                                    }`}>{trends.confidence} confidence</span>
                                </div>
                                {[
                                    { label: 'Competitor summary', value: trends.competitorSummary },
                                    { label: 'Trend signals', value: trends.trendSignals },
                                    { label: 'Seasonal factors', value: trends.seasonalFactors },
                                    { label: 'Recommended focus', value: trends.recommendedFocus },
                                    { label: 'Opportunities', value: trends.opportunities },
                                ].map(({ label, value }) => (
                                    <div key={label}>
                                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
                                        <p className="text-sm leading-relaxed text-charcoal whitespace-pre-wrap">{stripCiteTags(value)}</p>
                                    </div>
                                ))}
                                <p className="pt-2 text-xs text-muted">
                                    Generated {new Date(trends.createdAt).toLocaleString()}
                                </p>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </>
    );
}
