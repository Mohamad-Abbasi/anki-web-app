import { useState, useEffect } from 'react';
import { useDecks } from '../hooks/useDecks.js';
import { exportToApkg } from '../lib/apkg/index.js';
import db from '../lib/database/db.js';

export default function SettingsPage() {
  const { decks, updateDeck, loading } = useDecks();
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null);
  const [toast, setToast] = useState(null);

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
      });
    }
  }, [deck]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3000); };

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
      },
    });
    flash('ذخیره شد');
  };

  const handleExport = async () => {
    if (!deck) return;
    try {
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

  const clearAll = async () => {
    if (!confirm('همه‌ی دک‌ها، کارت‌ها و مدیا برای همیشه حذف شوند؟')) return;
    await db.delete();
    location.reload();
  };

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>تنظیمات</h2>

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
              <div className="field">
                <label>مراحل یادگیری (دقیقه، با فاصله)</label>
                <input value={form.learningSteps} onChange={(e) => setForm({ ...form, learningSteps: e.target.value })} dir="ltr" />
              </div>
              <button className="btn primary block" onClick={save}>ذخیره‌ی تنظیمات</button>
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
