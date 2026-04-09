import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { logout as apiLogout, type AuthUser, getMe } from './api/appApi';
import logo from './assets/logo.png';
import { config } from './config';
import AppLayout from './layouts/AppLayout';
import AgentsPage from './pages/AgentsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AuditLogPage from './pages/AuditLogPage';
import CampaignDetailPage from './pages/CampaignDetailPage';
import CampaignsPage from './pages/CampaignsPage';
import DashboardPage from './pages/DashboardPage';
import LibraryPage from './pages/LibraryPage';
import NewCampaignWizardPage from './pages/NewCampaignWizardPage';
import PostDetailPage from './pages/PostDetailPage';
import SettingsPage from './pages/SettingsPage';
import SignalsPage from './pages/SignalsPage';
import SSETestPage from './pages/SSETestPage';
import SubjectInpaintingPage from './pages/SubjectInpaintingPage';

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

    useEffect(() => {
        const handler = () => setUser(null);
        window.addEventListener('auth:unauthorized', handler);
        return () => window.removeEventListener('auth:unauthorized', handler);
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
            <div className="bg-charcoal flex h-screen flex-col items-center justify-center gap-5">
                <div className="flex items-center gap-3">
                    <img src={logo} alt="BodySpace" className="h-10 w-10 rounded-xl object-cover" />
                    <div>
                        <p className="text-lg font-bold text-white">BodySpace</p>
                        <p className="text-[11px] font-semibold tracking-widest text-teal-400 uppercase">GemStar</p>
                    </div>
                </div>
                <p className="text-sm text-white/50">Sign in to access the dashboard</p>
                <a
                    href={`${config.apiBaseUrl}/api/auth/login`}
                    className="flex items-center gap-3 rounded bg-white px-3 py-2.5 text-sm font-semibold text-[#5e5e5e] shadow-sm transition hover:bg-[#f3f3f3] active:bg-[#ebebeb]"
                    style={{ fontFamily: "'Segoe UI', sans-serif" }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 21 21">
                        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                    </svg>
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
                <Route path="posts/:id" element={<PostDetailPage />} />
                <Route path="library" element={<LibraryPage />} />
                <Route path="signals" element={<SignalsPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="inpainting" element={<SubjectInpaintingPage />} />
                <Route path="sse-test" element={<SSETestPage />} />
                <Route path="audit" element={<AuditLogPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
}
