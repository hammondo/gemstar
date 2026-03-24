const variants: Record<string, string> = {
    pending_review: 'bg-amber-100 text-amber-800',
    draft:          'bg-gray-100 text-gray-600',
    approved:       'bg-teal-400/20 text-teal-700',
    scheduled:      'bg-teal-400/20 text-teal-700',
    published:      'bg-teal-400/20 text-teal-700',
    rejected:       'bg-red-100 text-red-700',
    used:           'bg-purple-100 text-purple-700',
    push:           'bg-teal-400/20 text-teal-700',
    hold:           'bg-amber-100 text-amber-800',
    pause:          'bg-red-100 text-red-700',
};

const labels: Record<string, string> = {
    pending_review: 'Pending review',
    draft:          'Draft',
    approved:       'Approved',
    scheduled:      'Scheduled',
    published:      'Published',
    rejected:       'Rejected',
    used:           'Used',
    push:           'Push',
    hold:           'Hold',
    pause:          'Pause',
};

interface BadgeProps {
    value: string;
}

export default function Badge({ value }: BadgeProps) {
    const cls = variants[value] ?? 'bg-gray-100 text-gray-600';
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
            {labels[value] ?? value}
        </span>
    );
}
