import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { flushOutbox, pendingCount, syncNow as doSync } from '../lib/supabase/sync.js';
import { useAuth } from './AuthContext.jsx';

const SyncCtx = createContext(null);
export const useSync = () => useContext(SyncCtx) || { status: 'idle', pending: 0, sync: () => {} };

export function SyncProvider({ children }) {
  const { user } = useAuth();
  const [status, setStatus] = useState('synced'); // synced | syncing | offline | error
  const [pending, setPending] = useState(0);
  const timer = useRef();

  const refreshPending = useCallback(async () => {
    try { setPending(await pendingCount()); } catch { /* ignore */ }
  }, []);

  const sync = useCallback(async () => {
    if (!user) return;
    if (!navigator.onLine) { setStatus('offline'); return; }
    setStatus('syncing');
    try { await doSync(user.id); setStatus('synced'); }
    catch (e) { console.error('sync error:', e); setStatus('error'); }
    finally { refreshPending(); }
  }, [user, refreshPending]);

  useEffect(() => {
    refreshPending();
    if (!navigator.onLine) setStatus('offline');
    const onOnline = () => { setStatus('syncing'); flushOutbox().then(() => { refreshPending(); setStatus('synced'); }); };
    const onOffline = () => setStatus('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    timer.current = setInterval(() => { flushOutbox().then(refreshPending); }, 30000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(timer.current);
    };
  }, [refreshPending]);

  return (
    <SyncCtx.Provider value={{ status, pending, sync, refreshPending }}>
      {children}
    </SyncCtx.Provider>
  );
}
