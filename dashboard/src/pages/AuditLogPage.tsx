import { useCallback, useEffect, useRef, useState } from 'react';
import { type AuditLogEntry, type AuditLogFilters, getAuditLog } from '../api/appApi';
import PageHeader from '../components/PageHeader';

const AGENT_NAMES = [
    'fresha-watcher',
    'monitor',
    'campaign-planner',
    'image-generator',
    'library-generator',
    'scheduler',
];

const PAGE_SIZE = 50;

function StatusBadge({ status }: { status: string }) {
    const cls =
        status === 'success' ? 'bg-green-100 text-green-700' :
        status === 'error'   ? 'bg-red-100 text-red-700' :
                               'bg-amber-100 text-amber-700 animate-pulse';
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
            {status}
        </span>
    );
}

function TriggerBadge({ trigger }: { trigger: string }) {
    const cls =
        trigger === 'cron'       ? 'bg-purple-100 text-purple-700' :
        trigger === 'background' ? 'bg-sky-100 text-sky-700' :
                                   'bg-slate-100 text-slate-600';
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
            {trigger}
        </span>
    );
}

function formatDuration(ms: number | null): string {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatTs(ts: string): string {
    return new Date(ts).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function JsonViewer({ value, label }: { value: unknown; label: string }) {
    if (value == null) return <span className="text-warm-400 italic">—</span>;
    return (
        <div>
            <p className="mb-1 text-xs font-semibold text-warm-500 uppercase tracking-wide">{label}</p>
            <pre className="max-h-48 overflow-auto rounded-lg bg-warm-50 p-3 text-xs text-warm-700 whitespace-pre-wrap break-all">
                {JSON.stringify(value, null, 2)}
            </pre>
        </div>
    );
}

function EntryRow({ entry, expanded, onToggle }: {
    entry: AuditLogEntry;
    expanded: boolean;
    onToggle: () => void;
}) {
    return (
        <>
            <tr
                onClick={onToggle}
                className={`cursor-pointer border-b border-warm-100 text-sm transition-colors hover:bg-warm-50 ${expanded ? 'bg-warm-50' : ''}`}
            >
                <td className="px-4 py-3 text-xs text-warm-500 whitespace-nowrap">
                    {formatTs(entry.startedAt)}
                </td>
                <td className="px-4 py-3 font-mono font-medium text-charcoal whitespace-nowrap">
                    {entry.agentName}
                </td>
                <td className="px-4 py-3">
                    <TriggerBadge trigger={entry.trigger} />
                </td>
                <td className="px-4 py-3 text-xs text-warm-600 whitespace-nowrap">
                    {entry.userName ?? entry.userEmail ?? <span className="italic text-warm-400">system</span>}
                </td>
                <td className="px-4 py-3">
                    <StatusBadge status={entry.status} />
                </td>
                <td className="px-4 py-3 text-xs text-warm-500 whitespace-nowrap text-right">
                    {formatDuration(entry.durationMs)}
                </td>
                <td className="px-4 py-3 text-warm-400 text-xs">
                    {entry.error
                        ? <span className="text-red-500 truncate max-w-xs block">{entry.error}</span>
                        : '—'}
                </td>
            </tr>
            {expanded && (
                <tr className="bg-warm-50 border-b border-warm-200">
                    <td colSpan={7} className="px-6 py-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <JsonViewer value={entry.input} label="Input" />
                            <JsonViewer value={entry.output} label="Output" />
                            {entry.error && (
                                <div className="sm:col-span-2">
                                    <p className="mb-1 text-xs font-semibold text-red-500 uppercase tracking-wide">Error</p>
                                    <pre className="max-h-32 overflow-auto rounded-lg bg-red-50 p-3 text-xs text-red-700 whitespace-pre-wrap break-all">
                                        {entry.error}
                                    </pre>
                                </div>
                            )}
                            <div className="sm:col-span-2 flex flex-wrap gap-4 text-xs text-warm-500">
                                <span><span className="font-medium">ID:</span> {entry.id}</span>
                                {entry.completedAt && (
                                    <span><span className="font-medium">Completed:</span> {formatTs(entry.completedAt)}</span>
                                )}
                                {entry.userEmail && (
                                    <span><span className="font-medium">User:</span> {entry.userName} ({entry.userEmail})</span>
                                )}
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

export default function AuditLogPage() {
    const [entries, setEntries] = useState<AuditLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);

    const [filters, setFilters] = useState<AuditLogFilters>({});
    const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const load = useCallback((f: AuditLogFilters, page: number) => {
        setLoading(true);
        setError(null);
        getAuditLog({ ...f, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
            .then(({ entries: e, total: t }) => {
                setEntries(e);
                setTotal(t);
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(filters, offset); }, [load, filters, offset]);

    function handleFilterChange(patch: Partial<AuditLogFilters>) {
        const next = { ...filters, ...patch };
        // Remove undefined/empty values
        (Object.keys(next) as Array<keyof AuditLogFilters>).forEach((k) => {
            if (next[k] === '' || next[k] === undefined) delete next[k];
        });
        setFilters(next);
        setOffset(0);
    }

    function handleSearchChange(value: string) {
        if (searchRef.current) clearTimeout(searchRef.current);
        searchRef.current = setTimeout(() => handleFilterChange({ search: value }), 300);
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const currentPage = offset;

    return (
        <>
            <PageHeader title="Audit Log" subtitle={`${total} total entries`} />

            {/* Filters */}
            <div className="mb-4 flex flex-wrap gap-3">
                <input
                    type="search"
                    placeholder="Search agent, user, error…"
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="h-9 w-64 rounded-lg border border-warm-200 bg-white px-3 text-sm text-charcoal placeholder-warm-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <select
                    onChange={(e) => handleFilterChange({ agentName: e.target.value || undefined })}
                    className="h-9 rounded-lg border border-warm-200 bg-white px-3 text-sm text-charcoal shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                >
                    <option value="">All agents</option>
                    {AGENT_NAMES.map((n) => (
                        <option key={n} value={n}>{n}</option>
                    ))}
                </select>
                <select
                    onChange={(e) => handleFilterChange({ status: (e.target.value || undefined) as AuditLogFilters['status'] })}
                    className="h-9 rounded-lg border border-warm-200 bg-white px-3 text-sm text-charcoal shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                >
                    <option value="">All statuses</option>
                    <option value="running">Running</option>
                    <option value="success">Success</option>
                    <option value="error">Error</option>
                </select>
                <select
                    onChange={(e) => handleFilterChange({ trigger: (e.target.value || undefined) as AuditLogFilters['trigger'] })}
                    className="h-9 rounded-lg border border-warm-200 bg-white px-3 text-sm text-charcoal shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                >
                    <option value="">All triggers</option>
                    <option value="api">API</option>
                    <option value="cron">Cron</option>
                    <option value="background">Background</option>
                </select>
                <button
                    onClick={() => load(filters, offset)}
                    className="h-9 rounded-lg border border-warm-200 bg-white px-3 text-sm text-charcoal shadow-sm hover:bg-warm-50 transition-colors"
                >
                    Refresh
                </button>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-warm-200 bg-white shadow-sm overflow-hidden">
                {error && (
                    <div className="px-6 py-4 text-sm text-red-600 bg-red-50 border-b border-red-100">{error}</div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-warm-200 bg-warm-50 text-xs font-semibold text-warm-500 uppercase tracking-wide">
                                <th className="px-4 py-3 whitespace-nowrap">Started</th>
                                <th className="px-4 py-3 whitespace-nowrap">Agent</th>
                                <th className="px-4 py-3 whitespace-nowrap">Trigger</th>
                                <th className="px-4 py-3 whitespace-nowrap">User</th>
                                <th className="px-4 py-3 whitespace-nowrap">Status</th>
                                <th className="px-4 py-3 whitespace-nowrap text-right">Duration</th>
                                <th className="px-4 py-3">Error</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && entries.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-warm-400">
                                        Loading…
                                    </td>
                                </tr>
                            ) : entries.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-warm-400">
                                        No audit log entries found.
                                    </td>
                                </tr>
                            ) : (
                                entries.map((entry) => (
                                    <EntryRow
                                        key={entry.id}
                                        entry={entry}
                                        expanded={expandedId === entry.id}
                                        onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                                    />
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-warm-100 px-6 py-3">
                        <p className="text-xs text-warm-500">
                            Showing {offset * PAGE_SIZE + 1}–{Math.min((offset + 1) * PAGE_SIZE, total)} of {total}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setOffset((p) => Math.max(0, p - 1))}
                                disabled={currentPage === 0}
                                className="rounded-lg border border-warm-200 px-3 py-1.5 text-xs text-charcoal disabled:opacity-40 hover:bg-warm-50 transition-colors"
                            >
                                Previous
                            </button>
                            <span className="flex items-center text-xs text-warm-500">
                                Page {currentPage + 1} of {totalPages}
                            </span>
                            <button
                                onClick={() => setOffset((p) => p + 1)}
                                disabled={currentPage >= totalPages - 1}
                                className="rounded-lg border border-warm-200 px-3 py-1.5 text-xs text-charcoal disabled:opacity-40 hover:bg-warm-50 transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
