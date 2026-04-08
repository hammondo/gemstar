import { Activity, BarChart3, BookOpen, ClipboardList, FileText, LayoutDashboard, LogOut, Megaphone, Settings } from 'lucide-react';
import { Activity, BarChart3, BookOpen, Image, LayoutDashboard, LogOut, Megaphone, Settings } from 'lucide-react';
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
    return (
        <div className="flex h-screen overflow-hidden">
            {/* ── Sidebar ── */}
            <aside className="bg-charcoal flex w-60 shrink-0 flex-col">
                {/* Brand */}
                <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
                    <img src={logo} alt="BodySpace" className="h-8 w-8 rounded-lg object-cover" />
                    <div className="leading-tight">
                        <p className="text-sm font-bold text-white">BodySpace</p>
                        <p className="text-[10px] font-medium tracking-wider text-teal-400 uppercase">GemStar</p>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto px-3 py-4">
                    <ul className="space-y-0.5">
                        {navItems.map(({ to, icon: Icon, label, end }) => (
                            <li key={to}>
                                <NavLink
                                    to={to}
                                    end={end}
                                    className={({ isActive }) =>
                                        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                                            isActive
                                                ? 'bg-teal-400/15 text-teal-400'
                                                : 'text-white/60 hover:bg-white/5 hover:text-white'
                                        }`
                                    }
                                >
                                    {({ isActive }) => (
                                        <>
                                            <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} className="shrink-0" />
                                            {label}
                                        </>
                                    )}
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>

                {/* User */}
                <div className="border-t border-white/10 p-3">
                    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">
                            {(user.name || user.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-white">{user.name || user.email}</p>
                            {user.name && <p className="truncate text-[10px] text-white/50">{user.email}</p>}
                        </div>
                        <button
                            onClick={onLogout}
                            title="Sign out"
                            className="shrink-0 rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"
                        >
                            <LogOut size={15} />
                        </button>
                    </div>
                </div>
            </aside>

            {/* ── Main ── */}
            <div className="flex flex-1 flex-col overflow-hidden">
                {/* Top bar */}
                <header className="border-warm-200 flex h-16 shrink-0 items-center border-b bg-white px-7">
                    <div id="page-header-portal" className="flex-1" />
                </header>

                {/* Page content */}
                <main className="flex-1 overflow-y-auto p-7">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
