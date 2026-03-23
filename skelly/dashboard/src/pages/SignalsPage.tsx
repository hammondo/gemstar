import { useEffect, useState } from 'react';

function stripCiteTags(text: string): string {
    return text.replace(/<\/?cite[^>]*>/gi, '');
}
import { type ServiceAvailability, type TrendsBrief, getLatestTrends, getSignals } from '../api/appApi';
import Badge from '../components/Badge';
import PageHeader from '../components/PageHeader';

export default function SignalsPage() {
    const [signals, setSignals] = useState<Record<string, ServiceAvailability>>({});
    const [trends, setTrends] = useState<TrendsBrief | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([getSignals(), getLatestTrends()])
            .then(([{ signals: s }, { brief }]) => {
                setSignals(s);
                setTrends(brief);
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
            .finally(() => setLoading(false));
    }, []);

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
                    <div className="border-b border-warm-200 px-6 py-4">
                        <h2 className="text-sm font-semibold text-charcoal">Availability signals</h2>
                        <p className="mt-0.5 text-xs text-muted">Fresha slot data driving campaign decisions</p>
                    </div>

                    {loading ? (
                        <div className="px-6 py-10 text-center text-sm text-muted">Loading…</div>
                    ) : signalList.length === 0 ? (
                        <div className="px-6 py-10 text-center text-sm text-muted">No signals recorded yet.</div>
                    ) : (
                        <ul className="divide-y divide-warm-200">
                            {signalList.map((s) => (
                                <li key={s.serviceId} className="flex items-center justify-between gap-4 px-6 py-3.5">
                                    <div>
                                        <p className="text-sm font-medium text-charcoal">{s.serviceName}</p>
                                        <p className="mt-0.5 text-xs text-muted">{s.availableSlots} available slots</p>
                                    </div>
                                    <Badge value={s.signal} />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* Trends brief */}
                <section className="rounded-2xl border border-warm-200 bg-white shadow-sm">
                    <div className="border-b border-warm-200 px-6 py-4">
                        <h2 className="text-sm font-semibold text-charcoal">Latest trends brief</h2>
                        <p className="mt-0.5 text-xs text-muted">AI-generated market analysis</p>
                    </div>
                    <div className="p-6">
                        {loading ? (
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
