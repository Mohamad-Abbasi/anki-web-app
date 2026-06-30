import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import HomePage from './pages/HomePage.jsx';
import StudyPage from './pages/StudyPage.jsx';
import BrowsePage from './pages/BrowsePage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import StatsPage from './pages/StatsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { SyncProvider } from './auth/SyncContext.jsx';
import { cloudEnabled } from './lib/supabase/client.js';
import { pullShared, pullProgress, flushOutbox } from './lib/supabase/sync.js';

function AppRoutes() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/study/:deckId" element={<StudyPage />} />
          <Route path="/browse/:deckId" element={<BrowsePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}

function ConfigNeeded() {
  return (
    <div className="auth-screen">
      <div className="auth-card card-box">
        <h3 style={{ marginBottom: 10 }}>پیکربندی Supabase لازم است</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          مقادیر Project URL و anon public key را در فایل
          <code> src/lib/supabase/config.js </code>
          بگذار، سپس برنامه را دوباره باز کن.
        </p>
      </div>
    </div>
  );
}

function SyncGate() {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await flushOutbox();              // ابتدا پیشرفت آفلاینِ معوق را بفرست
        await pullShared();               // افزایشی (اولین بار کامل، چون lastPulledAt خالی است)
        await pullProgress(user.id);
      } catch (e) { console.error('sync error:', e); }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, [user.id]);

  if (!ready) {
    return (
      <div className="auth-screen">
        <div className="auth-card card-box" style={{ textAlign: 'center' }}>
          <div className="spinner" />
          <p style={{ color: 'var(--muted)' }}>در حال همگام‌سازی... / Syncing...</p>
        </div>
      </div>
    );
  }
  return (
    <SyncProvider>
      <AppRoutes />
    </SyncProvider>
  );
}

function Gate() {
  const { loading, session } = useAuth();
  if (!cloudEnabled) return <ConfigNeeded />;
  if (loading) return <div className="spinner" />;
  if (!session) return <LoginPage />;
  return <SyncGate />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
