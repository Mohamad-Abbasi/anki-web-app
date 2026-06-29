import { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StudyView from '../components/StudyView.jsx';
import CardEditor from '../components/CardEditor.jsx';
import { useStudy } from '../hooks/useStudy.js';
import { getNote, setCardQueue } from '../lib/database/models.js';
import { Queue } from '../lib/scheduler/scheduler.js';
import { clearMediaCache } from '../lib/render/media.js';

export default function StudyPage() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const { deck, queue, currentCard, stats, isComplete, loading, canUndo, handleAnswer, undo, loadQueue, preview } = useStudy(deckId);
  const [editor, setEditor] = useState(null);

  const intervals = useMemo(() => preview(currentCard), [preview, currentCard]);

  // آزادسازی blob URLهای مدیا هنگام خروج از مطالعه.
  useEffect(() => () => clearMediaCache(), []);

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

  const suspendCurrent = useCallback(async () => {
    if (!currentCard) return;
    await setCardQueue(currentCard.id, Queue.Suspended);
    await loadQueue();
  }, [currentCard, loadQueue]);

  if (loading) return <div className="spinner" />;

  if (isComplete) {
    return (
      <div className="empty">
        <div className="big">🎉</div>
        <h2>جلسه‌ی مطالعه تمام شد! / Session complete!</h2>
        <p>پاسخ‌داده / Answered: {stats.answered} — درست / Correct: {stats.correct}</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
          {canUndo && <button className="btn" onClick={undo}>↶ واگرد / Undo</button>}
          <button className="btn" onClick={openNew}>+ کارت / Card</button>
          <button className="btn primary" onClick={() => navigate('/')}>بازگشت / Back</button>
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
          <button className="icon-btn" title="واگرد / Undo (z)" onClick={undo} disabled={!canUndo}>↶</button>
          <button className="icon-btn" title="تعلیق / Suspend (-)" onClick={suspendCurrent}>⏸</button>
          <button className="icon-btn" title="کارت جدید / New" onClick={openNew}>＋</button>
          <button className="icon-btn" title="ویرایش / Edit (e)" onClick={openEdit}>✎</button>
        </div>
      </div>

      <div className="study-progress">پاسخ‌داده {stats.answered} · باقی‌مانده {queue.length}</div>

      <StudyView
        card={currentCard}
        onAnswer={handleAnswer}
        intervals={intervals}
        onUndo={canUndo ? undo : null}
        onEdit={openEdit}
        onSuspend={suspendCurrent}
      />

      {editor && <CardEditor deckId={deckId} note={editor.note} onClose={closeEditor} />}
    </div>
  );
}
