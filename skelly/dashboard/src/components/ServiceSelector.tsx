import type { ServiceAvailability, ServiceInfo } from '../api/appApi';

interface ServiceSelectorProps {
    services: ServiceInfo[];
    selected: Set<string>;
    signals?: Record<string, ServiceAvailability>;
    loading?: boolean;
    disabled?: boolean;
    label?: string;
    hint?: string;
    showFresha?: boolean;
    refreshing?: boolean;
    onToggle: (id: string) => void;
    onToggleGroup?: (ids: string[], allSelected: boolean) => void;
    onSelectPush?: () => void;
    onClear?: () => void;
    onRefreshFresha?: () => void;
}

export default function ServiceSelector({
    services,
    selected,
    signals = {},
    loading = false,
    disabled = false,
    label = 'Services to promote',
    hint,
    showFresha = false,
    refreshing = false,
    onToggle,
    onToggleGroup,
    onSelectPush,
    onClear,
    onRefreshFresha,
}: ServiceSelectorProps) {
    const byCategory = services.reduce<Record<string, ServiceInfo[]>>((acc, svc) => {
        (acc[svc.category] ??= []).push(svc);
        return acc;
    }, {});

    function signalBadge(id: string) {
        const sig = signals[id];
        if (!sig) return null;
        const color =
            sig.signal === 'push' ? 'bg-green-400' :
            sig.signal === 'pause' ? 'bg-red-400' :
            'bg-warm-300';
        return (
            <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-normal opacity-70">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
                {sig.availableSlots}
            </span>
        );
    }

    return (
        <div>
            <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-muted text-xs font-medium">
                    {label}
                    {hint && <span className="font-normal"> ({hint})</span>}
                </label>
                <div className="flex items-center gap-2 shrink-0">
                    {onSelectPush && (
                        <button
                            onClick={onSelectPush}
                            disabled={disabled || loading}
                            className="border-warm-200 text-muted rounded-lg border bg-white px-2.5 py-1 text-[11px] font-medium transition hover:border-teal-300 hover:text-teal-700 disabled:opacity-40"
                        >
                            Select push
                        </button>
                    )}
                    {onClear && (
                        <button
                            onClick={onClear}
                            disabled={disabled || selected.size === 0}
                            className="border-warm-200 text-muted rounded-lg border bg-white px-2.5 py-1 text-[11px] font-medium transition hover:border-red-300 hover:text-red-600 disabled:opacity-40"
                        >
                            Clear
                        </button>
                    )}
                    {showFresha && onRefreshFresha && (
                        <button
                            onClick={onRefreshFresha}
                            disabled={refreshing || disabled}
                            className="border-warm-200 text-muted flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1 text-[11px] font-medium transition hover:border-teal-300 hover:text-teal-700 disabled:opacity-40"
                        >
                            {refreshing ? (
                                <><span className="h-2.5 w-2.5 animate-spin rounded-full border border-teal-400 border-t-transparent" />Refreshing…</>
                            ) : (
                                'Refresh Fresha'
                            )}
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="bg-warm-100 h-32 w-full animate-pulse rounded-xl" />
            ) : (
                <div className="border-warm-200 rounded-xl border divide-y divide-warm-100">
                    {Object.entries(byCategory).map(([category, svcs]) => {
                        const groupIds = svcs.map((s) => s.id);
                        const allSelected = groupIds.every((id) => selected.has(id));
                        function handleToggleGroup() {
                            if (onToggleGroup) {
                                onToggleGroup(groupIds, allSelected);
                            } else {
                                groupIds.forEach((id) => {
                                    if (allSelected || !selected.has(id)) onToggle(id);
                                });
                            }
                        }
                        return (
                        <div key={category} className="px-4 py-3">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-muted text-[11px] font-semibold uppercase tracking-wide">{category}</p>
                                <button
                                    onClick={handleToggleGroup}
                                    disabled={disabled}
                                    className="text-[11px] font-medium text-teal-700 hover:text-teal-500 disabled:opacity-40 transition"
                                >
                                    {allSelected ? 'Deselect all' : 'Select all'}
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {svcs.map((svc) => {
                                    const checked = selected.has(svc.id);
                                    return (
                                        <button
                                            key={svc.id}
                                            onClick={() => onToggle(svc.id)}
                                            disabled={disabled}
                                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                                                checked
                                                    ? 'border-teal-400 bg-teal-50 text-teal-700'
                                                    : signals[svc.id]?.signal === 'pause'
                                                      ? 'border-warm-200 bg-warm-50 text-muted opacity-60 hover:border-warm-300'
                                                      : 'border-warm-200 bg-white text-charcoal hover:border-teal-300'
                                            }`}
                                        >
                                            {checked && <span className="mr-1">✓</span>}
                                            {svc.name}
                                            {signalBadge(svc.id)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
