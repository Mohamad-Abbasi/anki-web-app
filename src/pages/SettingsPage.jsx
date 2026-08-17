import { useState, useEffect, useRef } from 'react';
import { useDecks } from '../hooks/useDecks.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSync } from '../auth/SyncContext.jsx';
import { pushAllLocalDecks, estimateDeckMedia } from '../lib/supabase/sync.js';
import { exportBackup, importBackup } from '../lib/backup.js';
import db from '../lib/database/db.js';

// سهمیه‌ی رایگان Supabase Storage ≈ ۱ گیگابایت
const FREE_STORAGE_BYTES = 1024 * 1024 * 1024;
const mb = (b) => (b / 1048576).toFixed(0);

export default function SettingsPage() {
  const { decks, updateDeck, loading, refresh } = useDecks();
  const { user, profile, signOut, cloudEnabled } = useAuth();
  const { status, pending, sync } = useSync();
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploadInfo, setUploadInfo] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const backupInputRef = useRef(null);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.dataset.theme = next;
  };

  useEffect(() => {
    if (decks.length && selectedId == null) setSelectedId(decks[0].id);
  }, [decks, selectedId]);

  const deck = decks.find((d) => d.id === selectedId);
  useEffect(() => {
    if (deck) {
      setForm({
        scheduler: deck.scheduler || 'fsrs',
        newPerDay: deck.config?.newPerDay ?? 20,
        reviewsPerDay: deck.config?.reviewsPerDay ?? 200,
        requestRetention: deck.config?.requestRetention ?? 0.9,
        learningSteps: (deck.config?.learningSteps ?? [1, 10]).join(' '),
        relearningSteps: (deck.config?.relearningSteps ?? [10]).join(' '),
      });
    }
  }, [deck]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  /**
   * آپلود دک‌های محلی به ابر.
   * @param {boolean} includeResume ادامه‌دادن آپلود مدیای دک‌هایی که قبلاً ثبت شده‌اند
   */
  const uploadLocal = async (includeResume = false) => {
    const pendingDecks = decks.filter((d) => !d.cloudId);
    if (!pendingDecks.length && !includeResume) {
      flash('همه‌ی دک‌ها قبلاً آپلود شده‌اند / Nothing to upload');
      return;
    }

    const target = includeResume ? decks : pendingDecks;
    let totalBytes = 0, totalFiles = 0;
    for (const d of target) {
      const est = await estimateDeckMedia(d.id);
      totalBytes += est.bytes; totalFiles += est.count;
    }

    let skipMedia = false;
    if (totalBytes > 0) {
      const pct = Math.round((totalBytes / FREE_STORAGE_BYTES) * 100);
      const ok = confirm(
        `این دک‌ها ${totalFiles} فایل مدیا (~${mb(totalBytes)}MB) دارند — حدود ${pct}٪ از سهمیه‌ی رایگان ۱GB.\n` +
        `آپلود مدیا ممکن است چند دقیقه طول بکشد (قابل ادامه است؛ اگر قطع شد دوباره بزن).\n\n` +
        `OK = آپلود همراه با مدیا\nCancel = فقط متن کارت‌ها، بدون مدیا`,
      );
      if (!ok) skipMedia = true;
    }

    setBusy(true);
    setUploadInfo({ label: 'شروع / Starting…', pct: 0 });
    try {
      const res = await pushAllLocalDecks(user.id, (p) => {
        if (p.deck) {
          setUploadInfo({ label: `دک / Deck ${p.index}/${p.total}: ${p.deck}`, pct: 0 });
        } else if (p.phase === 'media') {
          const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
          setUploadInfo({ label: `مدیا / Media ${p.done}/${p.total}`, pct });
        } else if (p.phase === 'notes' || p.phase === 'cards') {
          setUploadInfo({ label: `${p.phase}: ${p.done}`, pct: 0 });
        }
      }, { skipMedia, includeResume });
      await sync();
      flash(`آپلود شد / Uploaded: ${res.uploaded} دک${res.resumed ? `، ادامه‌ی ${res.resumed} دک` : ''}`);
    } catch (e) {
      flash('خطا / Error: ' + e.message);
    } finally {
      setBusy(false);
      setUploadInfo(null);
    }
  };

  const save = async () => {
    if (!deck || !form) return;
    await updateDeck(deck.id, {
      scheduler: form.scheduler,
      config: {
        ...deck.config,
        newPerDay: Number(form.newPerDay),
        reviewsPerDay: Number(form.reviewsPerDay),
        requestRetention: Number(form.requestRetention),
        learningSteps: form.learningSteps.split(/\s+/).map(Number).filter((n) => n > 0),
        relearningSteps: form.relearningSteps.split(/\s+/).map(Number).filter((n) => n > 0),
      },
    });
    flash('ذخیره شد');
  };

  const handleExport = async () => {
    if (!deck) return;
    try {
      const { exportToApkg } = await import('../lib/apkg/index.js');
      const blob = await exportToApkg(deck.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${deck.name}.apkg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      flash('خطا در خروجی: ' + e.message);
    }
  };

  const handleBackup = async () => {
    setBusy(true);
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `ankiweb-backup-${d}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      flash('پشتیبان ساخته شد / Backup downloaded');
    } catch (e) {
      flash('خطا / Error: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('بازیابی همه‌ی داده‌های فعلی را جایگزین می‌کند. ادامه؟ / Restore replaces all current data. Continue?')) return;
    setBusy(true);
    try {
      const res = await importBackup(file);
      await refresh();
      flash(`بازیابی شد / Restored: ${res.cards} کارت`);
    } catch (err) {
      flash('خطا / Error: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    if (!confirm('همه‌ی دک‌ها، کارت‌ها و مدیا برای همیشه حذف شوند؟')) return;
    await db.delete();
    location.reload();
  };

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>تنظیمات / Settings</h2>

      {cloudEnabled && user && (
        <div className="card-box">
          <h3 style={{ marginBottom: 8 }}>حساب و همگام‌سازی / Account & Sync</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: 12 }}>
            {user.email} {profile?.role === 'admin' && <span className="pill review">admin</span>}
            <br />وضعیت / Status: <b>{status}</b>{pending > 0 ? ` — ${pending} مورد در صف` : ''}
          </p>
          <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
            <button className="btn primary" onClick={sync} disabled={busy}>↻ همگام‌سازی / Sync now</button>
            <button className="btn" onClick={() => uploadLocal(false)} disabled={busy}>⬆ آپلود دک‌های محلی / Upload local decks</button>
            <button className="btn" onClick={() => uploadLocal(true)} disabled={busy} title="ادامه‌ی آپلود مدیای ناتمام">
              ⟳ ادامه‌ی آپلود مدیا / Resume media
            </button>
          </div>

          {uploadInfo && (
            <div className="upload-progress">
              <div className="bar-outer"><div className="bar-inner" style={{ width: `${uploadInfo.pct}%` }} /></div>
              <span>{uploadInfo.label}{uploadInfo.pct ? ` — ${uploadInfo.pct}%` : ''}</span>
            </div>
          )}
          <button className="btn danger block" onClick={() => signOut()}>خروج / Sign out</button>
        </div>
      )}

      {decks.length === 0 ? (
        <p className="empty">ابتدا یک دک بساز.</p>
      ) : (
        <>
          <div className="card-box">
            <div className="field">
              <label>دک</label>
              <select value={selectedId ?? ''} onChange={(e) => setSelectedId(Number(e.target.value))}>
                {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          {form && (
            <div className="card-box">
              <h3 style={{ marginBottom: 14 }}>زمان‌بندی</h3>
              <div className="field">
                <label>الگوریتم</label>
                <select value={form.scheduler} onChange={(e) => setForm({ ...form, scheduler: e.target.value })}>
                  <option value="fsrs">FSRS (پیشنهادی — مثل AnkiWeb جدید)</option>
                  <option value="sm2">SM-2 (کلاسیک)</option>
                </select>
              </div>
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label>کارت جدید در روز</label>
                  <input type="number" value={form.newPerDay} onChange={(e) => setForm({ ...form, newPerDay: e.target.value })} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>مرور در روز</label>
                  <input type="number" value={form.reviewsPerDay} onChange={(e) => setForm({ ...form, reviewsPerDay: e.target.value })} />
                </div>
              </div>
              {form.scheduler === 'fsrs' && (
                <div className="field">
                  <label>نرخ به‌یادآوری هدف ({Math.round(form.requestRetention * 100)}%)</label>
                  <input type="range" min="0.7" max="0.97" step="0.01" value={form.requestRetention}
                    onChange={(e) => setForm({ ...form, requestRetention: e.target.value })} />
                </div>
              )}
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label>مراحل یادگیری (دقیقه) / Learning steps</label>
                  <input value={form.learningSteps} onChange={(e) => setForm({ ...form, learningSteps: e.target.value })} dir="ltr" />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>مراحل بازآموزی (دقیقه) / Relearning</label>
                  <input value={form.relearningSteps} onChange={(e) => setForm({ ...form, relearningSteps: e.target.value })} dir="ltr" />
                </div>
              </div>
              <button className="btn primary block" onClick={save}>ذخیره‌ی تنظیمات / Save</button>
            </div>
          )}

          <div className="card-box">
            <h3 style={{ marginBottom: 14 }}>خروجی</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 12 }}>
              این دک را به فایل .apkg سازگار با Anki ذخیره کن.
            </p>
            <button className="btn block" onClick={handleExport}>خروجی گرفتن «{deck?.name}»</button>
          </div>
        </>
      )}

      <div className="card-box">
        <h3 style={{ marginBottom: 14 }}>ظاهر / Appearance</h3>
        <button className="btn block" onClick={toggleTheme}>
          {theme === 'dark' ? '☀️ تم روشن / Light theme' : '🌙 تم تاریک / Dark theme'}
        </button>
      </div>

      <div className="card-box">
        <h3 style={{ marginBottom: 14 }}>پشتیبان‌گیری / Backup</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 12 }}>
          از همه‌ی دک‌ها، کارت‌ها، سوابق مرور و مدیا یک فایل پشتیبان بساز و جای امنی نگه دار.
          با «بازیابی» می‌توانی روی هر مرورگر/دستگاهی همه‌چیز را برگردانی.
          <br />Back up everything to one file; restore it on any browser or device.
        </p>
        <div className="row">
          <button className="btn primary" onClick={handleBackup} disabled={busy}>⬇ ساخت پشتیبان / Export</button>
          <button className="btn" onClick={() => backupInputRef.current?.click()} disabled={busy}>⬆ بازیابی / Restore</button>
        </div>
        <input ref={backupInputRef} type="file" accept=".zip" onChange={handleRestore} style={{ display: 'none' }} />
      </div>

      <div className="card-box">
        <h3 style={{ marginBottom: 14, color: 'var(--again)' }}>ناحیه‌ی خطر</h3>
        <button className="btn danger block" onClick={clearAll}>حذف همه‌ی داده‌ها</button>
      </div>

      <div className="card-box" style={{ textAlign: 'center' }}>
        <h3 style={{ marginBottom: 8 }}>درباره</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          AnkiWeb — اپ تکرار فاصله‌دار
        </p>
        <p style={{ marginTop: 6 }}>برنامه‌نویس: <b>محمد عباسی</b></p>
      </div>

      {toast && <div className="toast"><div className="msg">{toast}</div></div>}
    </div>
  );
}
