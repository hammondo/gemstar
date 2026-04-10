import {
    Activity,
    BarChart3,
    BookOpen,
    ClipboardList,
    Image,
    LayoutDashboard,
    LogOut,
    Megaphone,
    Menu,
    PanelLeftClose,
    PanelLeftOpen,
    Settings,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import type { AuthUser } from '../api/appApi';
import logo from '../assets/logo.png';

interface AppLayoutProps {
    user: AuthUser;
    onLogout: () => void;
}

interface NavItem {
    to: string;
    icon: typeof LayoutDashboard;
    label: string;
    end?: boolean;
}

const navItems: NavItem[] = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
    // { to: '/agents',    icon: Bot,             label: 'Agents' },
    { to: '/campaigns', icon: Megaphone, label: 'Campaigns' },
    { to: '/library', icon: BookOpen, label: 'Posts' },
    { to: '/inpainting', icon: Image, label: 'Inpainting' },
    { to: '/signals', icon: Activity, label: 'Signals' },
    { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    { to: '/audit', icon: ClipboardList, label: 'Audit Log' },
    { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function AppLayout({ user, onLogout }: AppLayoutProps) {
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const [isDesktopNavCollapsed, setIsDesktopNavCollapsed] = useState(() => {
        if (typeof window === 'undefined') {
            return false;
        }

        return window.localStorage.getItem('dashboard-desktop-nav-collapsed') === 'true';
    });

    const closeMobileNav = () => setIsMobileNavOpen(false);

    useEffect(() => {
        if (!isMobileNavOpen) {
            return;
        }

        const onEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeMobileNav();
            }
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onEscape);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onEscape);
        };
    }, [isMobileNavOpen]);

    useEffect(() => {
        window.localStorage.setItem('dashboard-desktop-nav-collapsed', String(isDesktopNavCollapsed));
    }, [isDesktopNavCollapsed]);

    return (
        <div className="relative flex h-screen overflow-hidden">
            <button
                type="button"
                aria-label="Close navigation"
                className={`fixed inset-0 z-30 bg-black/45 transition-opacity duration-200 md:hidden ${
                    isMobileNavOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                }`}
                onClick={closeMobileNav}
                tabIndex={isMobileNavOpen ? 0 : -1}
            />

            {/* ── Sidebar ── */}
            <aside
                className={`bg-charcoal fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 transform flex-col transition-all duration-200 ease-out md:translate-x-0 ${
                    isDesktopNavCollapsed ? 'md:w-20' : 'md:w-60'
                } ${isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                {/* Brand */}
                <div className="relative flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
                    <img src={logo} alt="BodySpace" className="h-8 w-8 rounded-lg object-cover" />
                    <div className={`leading-tight ${isDesktopNavCollapsed ? 'md:hidden' : ''}`}>
                        <p className="text-sm font-bold text-white">BodySpace</p>
                        <p className="text-[10px] font-medium tracking-wider text-teal-400 uppercase">GemStar</p>
                    </div>
                    <button
                        type="button"
                        className={`hidden items-center justify-center text-white/60 transition hover:text-white md:inline-flex ${
                            isDesktopNavCollapsed
                                ? 'bg-charcoal absolute top-1/2 -right-3 h-7 w-7 -translate-y-1/2 rounded-full border border-white/20 shadow-[0_4px_14px_rgba(0,0,0,0.35)] hover:border-teal-300/90 hover:text-teal-300 focus-visible:border-teal-300/90 focus-visible:text-teal-300 focus-visible:outline-none'
                                : 'ml-auto rounded-lg p-1.5 hover:bg-white/10'
                        }`}
                        onClick={() => setIsDesktopNavCollapsed((collapsed) => !collapsed)}
                        aria-label={isDesktopNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                        title={isDesktopNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                    >
                        {isDesktopNavCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={16} />}
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto overscroll-y-contain px-3 py-4">
                    <ul className="space-y-0.5">
                        {navItems.map(({ to, icon: Icon, label, end }) => (
                            <li key={to}>
                                <NavLink
                                    to={to}
                                    end={end}
                                    onClick={closeMobileNav}
                                    title={isDesktopNavCollapsed ? label : undefined}
                                    className={({ isActive }) =>
                                        `group flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                                            isDesktopNavCollapsed ? 'gap-0 md:justify-center md:px-2' : 'gap-3'
                                        } ${
                                            isActive
                                                ? 'bg-teal-400/15 text-teal-400'
                                                : 'text-white/60 hover:bg-white/5 hover:text-white'
                                        }`
                                    }
                                >
                                    {({ isActive }) => (
                                        <>
                                            <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} className="shrink-0" />
                                            <span className={isDesktopNavCollapsed ? 'md:hidden' : ''}>{label}</span>
                                        </>
                                    )}
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>

                {/* User */}
                <div className="border-t border-white/10 p-3">
                    <div
                        className={`flex rounded-xl px-3 py-2.5 ${
                            isDesktopNavCollapsed
                                ? 'items-center justify-center md:flex-col md:gap-2 md:px-0'
                                : 'items-center gap-3'
                        }`}
                    >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">
                            {(user.name || user.email).charAt(0).toUpperCase()}
                        </div>
                        <div className={`min-w-0 flex-1 ${isDesktopNavCollapsed ? 'md:hidden' : ''}`}>
                            <p className="truncate text-xs font-semibold text-white">{user.name || user.email}</p>
                            {user.name && <p className="truncate text-[10px] text-white/50">{user.email}</p>}
                        </div>
                        <button
                            onClick={onLogout}
                            title="Sign out"
                            className={`shrink-0 rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white ${
                                isDesktopNavCollapsed ? 'md:mt-1' : ''
                            }`}
                        >
                            <LogOut size={15} />
                        </button>
                    </div>
                </div>
            </aside>

            {/* ── Main ── */}
            <div
                className={`flex min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-200 ease-out ${
                    isDesktopNavCollapsed ? 'md:ml-20' : 'md:ml-60'
                }`}
            >
                {/* Top bar */}
                <header className="border-warm-200 flex h-16 shrink-0 items-center gap-3 border-b bg-white px-4 md:px-7">
                    <button
                        type="button"
                        className="text-charcoal inline-flex items-center justify-center rounded-lg border border-black/10 p-2 transition hover:bg-black/5 md:hidden"
                        aria-label={isMobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
                        onClick={() => setIsMobileNavOpen((open) => !open)}
                    >
                        {isMobileNavOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>
                    <div id="page-header-portal" className="flex-1" />
                </header>

                {/* Page content */}
                <main className="flex-1 overflow-y-auto overscroll-y-contain p-4 md:p-7">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
