import { createPortal } from 'react-dom';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
    const portal = document.getElementById('page-header-portal');
    if (!portal) return null;

    return createPortal(
        <div className="flex items-center justify-between gap-4">
            <div>
                <h1 className="text-base font-bold text-charcoal">{title}</h1>
                {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>,
        portal,
    );
}
