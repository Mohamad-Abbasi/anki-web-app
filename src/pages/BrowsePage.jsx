import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CardEditor from '../components/CardEditor.jsx';
import { getNotesByDeck, deleteNote, getDeck } from '../lib/database/models.js';

function stripHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '$1').trim();
}

export default function BrowsePage() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const [deck, setDeck] = useState(null);
  const [notes, setNotes] = useState([]);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setDeck(await getDeck(deckId));
    setNotes(await getNotesByDeck(deckId));
    setLoading(false);
  }, [deckId]);

  useEffect(() => { load(); }, [load]);

  const closeEditor = useCallback(async (changed) => {
    setEditor(null);
    if (changed) await load();
  }, [load]);

  const filtered = notes.filter((n) =>
    !query || n.fields.some((f) => stripHtml(f).toLowerCase().includes(query.toLowerCase())),
  );

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <div className="section-head">
        <button className="btn ghost" onClick={() => navigate('/')}>‹ بازگشت</button>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{deck?.name}</span>
        <button className="btn primary" onClick={() => setEditor({ new: true })}>+ کارت</button>
      </div>

      <div className="field">
        <input placeholder="جستجو..." value={query} onChange={(e) => setQuery(e.target.value)} dir="auto" />
      </div>

      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 10 }}>{filtered.length} نوت</p>

      {filtered.map((n) => (
        <div className="deck" key={n.id}>
          <div className="grow" onClick={() => setEditor({ note: n })} style={{ cursor: 'pointer' }}>
            <h3 style={{ fontWeight: 600 }}>{stripHtml(n.fields[0]) || '(خالی)'}</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {stripHtml(n.fields[1])}
            </p>
          </div>
          <button
            className="icon-btn"
            onClick={async () => { if (confirm('این نوت حذف شود؟')) { await deleteNote(n.id); await load(); } }}
          >🗑</button>
        </div>
      ))}

      {editor && <CardEditor deckId={deckId} note={editor.note} onClose={closeEditor} />}
    </div>
  );
}
