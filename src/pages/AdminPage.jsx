import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { supabase } from '../lib/supabase/client.js';

export default function AdminPage() {
  const { isAdmin, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('created_at');
    if (error) setMsg(error.message);
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) load(); else setLoading(false); }, [isAdmin, load]);

  const setRole = async (id, role) => {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    if (error) setMsg(error.message);
    await load();
  };

  if (!isAdmin) return <p className="empty">دسترسی ادمین لازم است. / Admin only.</p>;
  if (loading) return <div className="spinner" />;

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>مدیریت کاربران / Users ({rows.length}/10)</h2>
      {msg && <p style={{ color: 'var(--again)', fontSize: '0.85rem' }}>{msg}</p>}
      {rows.map((p) => (
        <div className="deck" key={p.id}>
          <div className="grow">
            <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.email}{p.id === user.id ? ' (تو)' : ''}</h3>
            <div className="counts">
              <span className={`pill ${p.role === 'admin' ? 'review' : 'new'}`}>{p.role}</span>
            </div>
          </div>
          {p.role === 'admin' ? (
            <button className="btn" disabled={p.id === user.id} onClick={() => setRole(p.id, 'user')}>عادی / Make user</button>
          ) : (
            <button className="btn" onClick={() => setRole(p.id, 'admin')}>ادمین / Make admin</button>
          )}
        </div>
      ))}
    </div>
  );
}
