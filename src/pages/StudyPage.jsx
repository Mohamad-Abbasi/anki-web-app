import { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StudyView from '../components/StudyView.jsx';
import CardEditor from '../components/CardEditor.jsx';
import { useStudy } from '../hooks/useStudy.js';
import { getNote } from '../lib/database/models.js';

export default function StudyPage() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const { deck, queue, currentCard, stats, isComplete, loading, handleAnswer, loadQueue, preview } = useStudy(deckId);
  const [editor, setEditor] = useState(null); // null | {note} | {new:true}

  const intervals = useMemo(() => preview(currentCard), [preview, currentCard]);

  const openNew = useCallback(() => setEditor({ new: true }), []);
  const openEdit = useCallback(async () => {
    if (!currentCard) return;
    const note = await getNote(currentCard.noteId);
    setEditor({ note });
  }, [currentCard]);

  const closeEditor = useCallback(async (changed) => {
    setEditor(null);
    if (changed) await loadQueue();
  }, [loadQueue]);

  if (loading) return <div className="spinner" />;

  if (isComplete) {
    return (
      <div className="empty">
        <div className="big">🎉</div>
        <h2>جلسه‌ی مطالعه تمام شد!</h2>
        <p>پاسخ‌داده: {stats.answered} — درست: {stats.correct}</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
          <button className="btn" onClick={openNew}>+ کارت جدید</button>
          <button className="btn primary" onClick={() => navigate('/')}>بازگشت</button>
        </div>
        {editor && <CardEditor deckId={deckId} note={editor.note} onClose={closeEditor} />}
      </div>
    );
  }

  return (
    <div>
      <div className="section-head">
        <button className="btn ghost" onClick={() => navigate('/')}>‹ بازگشت</button>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{deck?.name}</span>
        <div className="row">
          <button className="icon-btn" title="کارت جدید" onClick={openNew}>＋</button>
          <button className="icon-btn" title="ویرایش" onClick={openEdit}>✎</button>
        </div>
      </div>

      <div className="study-progress">پاسخ‌داده {stats.answered} · باقی‌مانده {queue.length}</div>

      <StudyView card={currentCard} onAnswer={handleAnswer} intervals={intervals} />

      {editor && <CardEditor deckId={deckId} note={editor.note} onClose={closeEditor} />}
    </div>
  );
}
