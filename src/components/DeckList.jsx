import { useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDecks } from '../hooks/useDecks.js';
import { renameDeck, getDecks } from '../lib/database/models.js';
import { cloudEnabled } from '../lib/supabase/client.js';
import { pushDeckTree, getSyncUser, cloudDeleteDeck } from '../lib/supabase/sync.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { buildDeckTree, flattenTree, collectDeckIds } from '../lib/deckTree.js';
import CustomStudy from './CustomStudy.jsx';

export default function DeckList() {
  const { decks, counts, loading, addNewDeck, removeDeck, refresh } = useDecks();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [toast, setToast] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [customFor, setCustomFor] = useState(null);
  const fileRef = useRef(null);

  const tree = useMemo(() => buildDeckTree(decks, counts), [decks, counts]);
  const rows = useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);

  const toggle = useCallback((key) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

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

      {rows.map((node) => {
        const deck = node.deck;
        const c = node.counts;
        const total = c.new + c.learn + c.review;
        // گره‌ی بدون دکِ واقعی (فقط والدِ نام‌گذاری) قابل مطالعه نیست.
        const studyId = deck ? deck.id : collectDeckIds(node)[0];
        return (
          <div className="deck" key={node.key} style={{ marginInlineStart: node.depth * 16 }}>
            {node.hasChildren ? (
              <button className="icon-btn twisty" onClick={() => toggle(node.key)} title="باز/بسته">
                {collapsed.has(node.key) ? '▸' : '▾'}
              </button>
            ) : <span className="twisty-spacer" />}

            <div
              className="grow"
              onClick={() => studyId && navigate(`/study/${studyId}`)}
              style={{ cursor: studyId ? 'pointer' : 'default' }}
            >
              <h3>{node.title}</h3>
              <div className="counts">
                <span className="pill new">جدید {c.new}</span>
                <span className="pill learn">یادگیری {c.learn}</span>
                <span className="pill review">مرور {c.review}</span>
              </div>
            </div>

            {deck && (
              <>
                <button className="icon-btn" title="مطالعه‌ی سفارشی / Custom study" onClick={() => setCustomFor(deck)}>⚙</button>
                <button className="icon-btn" title="مرور کارت‌ها / Browse" onClick={() => navigate(`/browse/${deck.id}`)}>✎</button>
                <button
                  className="icon-btn"
                  title="تغییر نام / Rename"
                  onClick={async () => {
                    const newName = prompt('نام جدید دک / New deck name:', deck.name);
                    if (newName && newName.trim()) { await renameDeck(deck.id, newName.trim()); await refresh(); }
                  }}
                >✏️</button>
                {isAdmin && (
                  <button
                    className="icon-btn"
                    title="حذف دک / Delete (admin)"
                    onClick={async () => {
                      if (!confirm(`دک «${deck.name}» و همه‌ی کارت‌هایش حذف شود؟ / Delete deck?`)) return;
                      if (cloudEnabled && deck.cloudId) {
                        try { await cloudDeleteDeck(deck.cloudId); } catch (e) { flash('خطای حذف ابری / Cloud delete error: ' + e.message); }
                      }
                      await removeDeck(deck.id);
                    }}
                  >🗑</button>
                )}
              </>
            )}

            <button className="btn primary" onClick={() => studyId && navigate(`/study/${studyId}`)} disabled={total === 0}>
              {total > 0 ? 'مطالعه' : 'تمام'}
            </button>
          </div>
        );
      })}

      {customFor && (
        <CustomStudy
          deck={customFor}
          onClose={() => setCustomFor(null)}
          onStart={(params) => {
            setCustomFor(null);
            navigate(`/study/${customFor.id}?${params}`);
          }}
        />
      )}

      <footer className="credit">
        ساخته‌شده توسط <b>محمد عباسی</b> · برنامه‌نویس
      </footer>

      {toast && <div className="toast"><div className="msg">{toast}</div></div>}
    </div>
  );
}
