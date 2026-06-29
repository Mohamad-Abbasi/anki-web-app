import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const fn = mode === 'signin' ? signIn : signUp;
      const { error } = await fn(email.trim(), password);
      if (error) setMsg(error.message);
      else if (mode === 'signup') setMsg('حساب ساخته شد. اگر تأیید ایمیل فعال است، ایمیلت را چک کن. / Account created.');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card card-box">
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 8 }}>
          <div className="logo">A</div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>AnkiWeb</h1>
        </div>
        <p style={{ textAlign: 'center', color: 'var(--muted)', marginBottom: 18 }}>
          {mode === 'signin' ? 'ورود به حساب / Sign in' : 'ساخت حساب / Sign up'}
        </p>
        <form onSubmit={submit}>
          <div className="field">
            <label>ایمیل / Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" autoComplete="email" required />
          </div>
          <div className="field">
            <label>رمز عبور / Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={6} />
          </div>
          {msg && <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 10 }}>{msg}</p>}
          <button className="btn primary block" type="submit" disabled={busy}>
            {busy ? '...' : mode === 'signin' ? 'ورود / Sign in' : 'ثبت‌نام / Sign up'}
          </button>
        </form>
        <button
          className="btn ghost block"
          style={{ marginTop: 10 }}
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg(null); }}
        >
          {mode === 'signin' ? 'حساب نداری؟ ثبت‌نام کن / Create account' : 'حساب داری؟ وارد شو / Sign in'}
        </button>
      </div>
      <p className="credit">برنامه‌نویس: <b>محمد عباسی</b></p>
    </div>
  );
}
