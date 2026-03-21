import { useEffect, useState } from 'react';
import { type BodyspaceStatus, getBodyspaceStatus, getHealth } from '../api/appApi';
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

    useEffect(() => {
        Promise.all([getHealth(), getBodyspaceStatus()])
            .then(([h, s]) => {
                setHealth(h);
                setBsStatus(s);
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
            .finally(() => setLoading(false));
    }, []);

    return (
        <>
            <PageHeader title="Settings" subtitle="System status and schedule configuration" />

            {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="space-y-5">
                {/* API health */}
                <div className="rounded-2xl border border-warm-200 bg-white p-6 shadow-sm">
                    <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">API health</p>
                    {loading ? (
                        <p className="text-sm text-muted">Loading…</p>
                    ) : health ? (
                        <div className="flex items-center gap-3">
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
        </>
    );
}
