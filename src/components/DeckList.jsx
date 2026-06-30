import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDecks } from '../hooks/useDecks.js';
import { renameDeck, getDecks } from '../lib/database/models.js';
import { cloudEnabled } from '../lib/supabase/client.js';
import { pushDeckTree, getSyncUser } from '../lib/supabase/sync.js';

export default function DeckList() {
  const { decks, counts, loading, addNewDeck, removeDeck, refresh } = useDecks();
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleCreate = useCallback(async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await addNewDeck(name.trim());
    setName('');
    setShowNew(false);
  }, [name, addNewDeck]);

  const handleImport = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const mb = file.size / 1048576;
    if (mb > 80 && !confirm(
      `این فایل بزرگ است (${mb.toFixed(0)}MB) و ورود آن ممکن است کمی طول بکشد و حافظه‌ی زیادی بگیرد (به‌ویژه روی موبایل). ادامه؟\nLarge file — import may be slow. Continue?`,
    )) return;

    setImporting(true);
    setProgress('در حال خواندن فایل... / Reading...');
    try {
      const { importApkgFile } = await import('../lib/apkg/index.js'); // بارگذاری تنبل sql.js
      const res = await importApkgFile(file, (p) => {
        if (p.phase === 'parse') setProgress('در حال باز کردن فایل... / Unpacking...');
        else if (p.phase === 'save') setProgress('در حال ذخیره‌ی کارت‌ها... / Saving cards...');
        else if (p.phase === 'media') setProgress(`ذخیره‌ی مدیا / Media: ${p.done}/${p.total}`);
      });
      await refresh();
      flash(`وارد شد / Imported: ${res.cardCount} کارت، ${res.mediaCount} مدیا`);

      // آپلود به کتابخانه‌ی مشترک (در صورت فعال‌بودن ابر).
      if (cloudEnabled) {
        const all = await getDecks();
        const userId = getSyncUser();
        for (const d of all.filter((x) => !x.cloudId)) {
          setProgress(`آپلود به ابر / Uploading: ${d.name}`);
          try {
            await pushDeckTree(d.id, userId, (p) => {
              if (p.phase === 'media') setProgress(`آپلود مدیا / Uploading media: ${p.done}/${p.total}`);
            });
          } catch (e) { console.error('push failed:', e); }
        }
      }
    } catch (err) {
      flash(`خطا در ورود / Import error: ${err.message}`);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }, [refresh, flash]);

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <div className="section-head">
        <h2>دک‌های من</h2>
        <div className="row">
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? '...' : '⬇ ورود apkg'}
          </button>
          <button className="btn primary" onClick={() => setShowNew((s) => !s)}>+ دک جدید</button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept=".apkg,.colpkg,.zip" onChange={handleImport} style={{ display: 'none' }} />

      {progress && (
        <div className="card-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="spinner" style={{ margin: 0, width: 22, height: 22 }} />
          <span>{progress}</span>
        </div>
      )}

      {showNew && (
        <form className="card-box" onSubmit={handleCreate}>
          <div className="field">
            <label>نام دک</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً واژگان انگلیسی" autoFocus />
          </div>
          <div className="row">
            <button type="submit" className="btn primary block">ساختن</button>
            <button type="button" className="btn ghost" onClick={() => setShowNew(false)}>انصراف</button>
          </div>
        </form>
      )}

      {decks.length === 0 && !showNew && (
        <div className="empty">
          <div className="big">📚</div>
          <p>هنوز دکی نداری.</p>
          <p style={{ fontSize: '0.9rem' }}>یک دک بساز یا فایل <b>.apkg</b> از AnkiWeb وارد کن.</p>
        </div>
      )}

      {decks.map((deck) => {
        const c = counts[deck.id] || {};
        const total = (c.new || 0) + (c.learn || 0) + (c.review || 0);
        return (
          <div className="deck" key={deck.id}>
            <div className="grow" onClick={() => navigate(`/study/${deck.id}`)} style={{ cursor: 'pointer' }}>
              <h3>{deck.name}</h3>
              <div className="counts">
                <span className="pill new">جدید {c.new || 0}</span>
                <span className="pill learn">یادگیری {c.learn || 0}</span>
                <span className="pill review">مرور {c.review || 0}</span>
              </div>
            </div>
            <button className="icon-btn" title="مرور کارت‌ها / Browse" onClick={() => navigate(`/browse/${deck.id}`)}>✎</button>
            <button
              className="icon-btn"
              title="تغییر نام / Rename"
              onClick={async () => {
                const name = prompt('نام جدید دک / New deck name:', deck.name);
                if (name && name.trim()) { await renameDeck(deck.id, name.trim()); await refresh(); }
              }}
            >✏️</button>
            <button
              className="icon-btn"
              title="حذف دک"
              onClick={async () => {
                if (confirm(`دک «${deck.name}» و همه‌ی کارت‌هایش حذف شود؟`)) await removeDeck(deck.id);
              }}
            >🗑</button>
            <button className="btn primary" onClick={() => navigate(`/study/${deck.id}`)} disabled={total === 0}>
              {total > 0 ? 'مطالعه' : 'تمام'}
            </button>
          </div>
        );
      })}

      <footer className="credit">
        ساخته‌شده توسط <b>محمد عباسی</b> · برنامه‌نویس
      </footer>

      {toast && <div className="toast"><div className="msg">{toast}</div></div>}
    </div>
  );
}
