import { useState, useEffect, useCallback, useMemo } from 'react';
import CardEditor from '../components/CardEditor.jsx';
import db from '../lib/database/db.js';
import { getDecks } from '../lib/database/models.js';

function strip(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '$1').trim();
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState([]);
  const [deckMap, setDeckMap] = useState({});
  const [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [allNotes, decks] = await Promise.all([db.notes.toArray(), getDecks()]);
    setNotes(allNotes);
    setDeckMap(Object.fromEntries(decks.map((d) => [d.id, d.name])));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return notes
      .filter((n) =>
        n.fields.some((f) => strip(f).toLowerCase().includes(q)) ||
        (n.tags || []).some((t) => t.toLowerCase().includes(q)),
      )
      .slice(0, 200);
  }, [query, notes]);

  const closeEditor = useCallback(async (changed) => {
    setEditor(null);
    if (changed) await load();
  }, [load]);

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>جستجو / Search</h2>
      <div className="field">
        <input
          placeholder="جستجو در همه‌ی دک‌ها... / Search all decks..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          dir="auto"
        />
      </div>

      {loading ? (
        <div className="spinner" />
      ) : query.trim() === '' ? (
        <p className="empty">عبارتی برای جستجو بنویس. / Type to search.</p>
      ) : (
        <>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 10 }}>{results.length} نتیجه</p>
          {results.map((n) => (
            <div className="deck" key={n.id}>
              <div className="grow" onClick={() => setEditor({ note: n })} style={{ cursor: 'pointer' }}>
                <h3 style={{ fontWeight: 600 }}>{strip(n.fields[0]) || '(خالی)'}</h3>
                <p style={{ color: 'var(--muted)', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {deckMap[n.deckId] || '—'} · {strip(n.fields[1])}
                </p>
              </div>
            </div>
          ))}
        </>
      )}

      {editor && <CardEditor deckId={editor.note.deckId} note={editor.note} onClose={closeEditor} />}
    </div>
  );
}
