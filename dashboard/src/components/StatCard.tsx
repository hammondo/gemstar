import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
    label: string;
    value: string | number;
    icon: LucideIcon;
    accent?: boolean;
    sub?: string;
}

export default function StatCard({ label, value, icon: Icon, accent, sub }: StatCardProps) {
    return (
        <div className="flex items-start gap-4 rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
            <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    accent ? 'bg-teal-700 text-white' : 'bg-warm-100 text-teal-700'
                }`}
            >
                <Icon size={20} strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wider text-muted uppercase">{label}</p>
                <p className="mt-0.5 text-2xl font-bold text-charcoal">{value}</p>
                {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
            </div>
        </div>
    );
}
