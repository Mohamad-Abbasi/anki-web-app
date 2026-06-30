import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, cloudEnabled } from '../lib/supabase/client.js';
import { setSyncUser } from '../lib/supabase/sync.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid) => {
    if (!uid) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    setProfile(data || null);
  }, []);

  useEffect(() => {
    if (!cloudEnabled) { setLoading(false); return; }
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setSyncUser(data.session?.user?.id || null);
      await loadProfile(data.session?.user?.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      setSyncUser(s?.user?.id || null);
      await loadProfile(s?.user?.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback((email, password) =>
    supabase.auth.signInWithPassword({ email, password }), []);
  const signUp = useCallback((email, password) =>
    supabase.auth.signUp({ email, password }), []);
  const signOut = useCallback(() => supabase.auth.signOut(), []);

  const value = {
    cloudEnabled,
    session,
    user: session?.user || null,
    profile,
    isAdmin: profile?.role === 'admin',
    loading,
    signIn, signUp, signOut,
    refreshProfile: () => loadProfile(session?.user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
