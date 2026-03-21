import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { type AuthUser, getMe, logout as apiLogout } from './api/appApi';
import { config } from './config';
import logo from './assets/logo.png';
import AppLayout from './layouts/AppLayout';
import AgentsPage from './pages/AgentsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import CampaignDetailPage from './pages/CampaignDetailPage';
import CampaignsPage from './pages/CampaignsPage';
import NewCampaignWizardPage from './pages/NewCampaignWizardPage';
import DashboardPage from './pages/DashboardPage';
import PostDetailPage from './pages/PostDetailPage';
import PostsPage from './pages/PostsPage';
import SettingsPage from './pages/SettingsPage';
import SignalsPage from './pages/SignalsPage';
import ThemeColorsPage from './pages/ThemeColorsPage';

export default function App() {
    const [authChecked, setAuthChecked] = useState(false);
    const [user, setUser] = useState<AuthUser | null>(null);

    useEffect(() => {
        getMe()
            .then(({ user: me }) => {
                setUser(me);
                setAuthChecked(true);
            })
            .catch(() => setAuthChecked(true));
    }, []);

    function handleLogout() {
        void apiLogout().then(() => setUser(null));
    }

    if (!authChecked) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-5 bg-charcoal">
                <div className="flex items-center gap-3">
                    <img
                        src={logo}
                        alt="BodySpace"
                        className="h-10 w-10 rounded-xl object-cover"
                    />
                    <div>
                        <p className="text-lg font-bold text-white">BodySpace</p>
                        <p className="text-[11px] font-semibold tracking-widest text-teal-400 uppercase">GemStar</p>
                    </div>
                </div>
                <p className="text-sm text-white/50">Sign in to access the dashboard</p>
                <a
                    href={`${config.apiBaseUrl}/api/auth/login`}
                    className="rounded-xl bg-teal-400 px-6 py-2.5 text-sm font-bold text-charcoal transition hover:brightness-110"
                >
                    Sign in with Microsoft
                </a>
            </div>
        );
    }

    return (
        <Routes>
            <Route element={<AppLayout user={user} onLogout={handleLogout} />}>
                <Route index element={<DashboardPage />} />
                <Route path="agents" element={<AgentsPage />} />
                <Route path="campaigns" element={<CampaignsPage />} />
                <Route path="campaigns/new" element={<NewCampaignWizardPage />} />
                <Route path="campaigns/:id" element={<CampaignDetailPage />} />
                <Route path="posts" element={<PostsPage />} />
                <Route path="posts/:id" element={<PostDetailPage />} />
                <Route path="signals" element={<SignalsPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="theme" element={<ThemeColorsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
}
