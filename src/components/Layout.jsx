import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSync } from '../auth/SyncContext.jsx';

const SYNC_LABEL = {
  synced: { t: 'همگام', cls: 'ok', icon: '●' },
  syncing: { t: 'در حال…', cls: 'busy', icon: '◐' },
  offline: { t: 'آفلاین', cls: 'off', icon: '○' },
  error: { t: 'خطا', cls: 'err', icon: '✕' },
};

const baseNav = [
  { to: '/', label: 'دک‌ها', icon: IconDecks },
  { to: '/search', label: 'جستجو', icon: IconSearch },
  { to: '/stats', label: 'آمار', icon: IconStats },
  { to: '/settings', label: 'تنظیمات', icon: IconSettings },
];

export default function Layout({ children }) {
  const location = useLocation();
  const { isAdmin } = useAuth();
  const { status, pending, sync } = useSync();
  const s = SYNC_LABEL[status] || SYNC_LABEL.synced;
  const navItems = isAdmin ? [...baseNav, { to: '/admin', label: 'کاربران', icon: IconUsers }] : baseNav;
  // در صفحه‌ی مطالعه نوار پایین مخفی می‌شود تا فضای بیشتری باشد.
  const isStudy = location.pathname.startsWith('/study/');

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">A</div>
          <div>
            <h1>AnkiWeb</h1>
            <span className="byline">برنامه‌نویس: محمد عباسی</span>
          </div>
        </div>
        <button className={`sync-chip ${s.cls}`} onClick={sync} title="همگام‌سازی / Sync now">
          <span className="dot">{s.icon}</span>
          <span>{s.t}{pending > 0 ? ` (${pending})` : ''}</span>
        </button>
      </header>

      <main className="content">{children}</main>

      {!isStudy && (
        <nav className="bottomnav">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

function IconDecks() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function IconStats() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="20" x2="6" y2="12" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="9" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
