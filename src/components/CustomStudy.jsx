import { useState, useEffect } from 'react';
import db from '../lib/database/db.js';

// مطالعه‌ی سفارشی: فیلتر با برچسب، حالت مرور فشرده (cram)، و فقط کارت‌های سخت.
export default function CustomStudy({ deck, onClose, onStart }) {
  const [mode, setMode] = useState('due');   // due | cram | lapses
  const [tag, setTag] = useState('');
  const [limit, setLimit] = useState(50);
  const [tags, setTags] = useState([]);

  useEffect(() => {
    (async () => {
      const notes = await db.notes.where('deckId').equals(Number(deck.id)).toArray();
      const set = new Set();
      for (const n of notes) for (const t of n.tags || []) set.add(t);
      setTags([...set].sort().slice(0, 100));
    })();
  }, [deck.id]);

  const start = () => {
    const p = new URLSearchParams();
    if (mode !== 'due') p.set('mode', mode);
    if (tag) p.set('tag', tag);
    if (limit) p.set('limit', String(limit));
    onStart(p.toString());
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>مطالعه‌ی سفارشی / Custom study</h3>
        <p className="lbl-hint" style={{ display: 'block', marginBottom: 14 }}>{deck.name}</p>

        <div className="field">
          <label>حالت / Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="due">سررسیدهای امروز / Due today</option>
            <option value="cram">مرور فشرده — بدون تغییر زمان‌بندی / Cram (no scheduling)</option>
            <option value="lapses">فقط کارت‌های سخت / Difficult cards only</option>
          </select>
        </div>

        {tags.length > 0 && (
          <div className="field">
            <label>برچسب / Tag</label>
            <select value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">همه / All</option>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        <div className="field">
          <label>حداکثر تعداد کارت / Card limit</label>
          <input type="number" min="1" max="9999" value={limit} onChange={(e) => setLimit(e.target.value)} dir="ltr" />
        </div>

        {mode === 'cram' && (
          <p className="lbl-hint" style={{ display: 'block', marginBottom: 12 }}>
            در حالت فشرده، پاسخ‌ها زمان‌بندی واقعی کارت‌ها را تغییر نمی‌دهند.<br />
            Cram mode does not affect real scheduling.
          </p>
        )}

        <div className="actions">
          <button className="btn primary block" onClick={start}>شروع / Start</button>
          <button className="btn ghost" onClick={onClose}>بستن / Close</button>
        </div>
      </div>
    </div>
  );
}
