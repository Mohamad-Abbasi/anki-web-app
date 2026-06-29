import { useState, useEffect, useCallback, useRef } from 'react';
import { useRenderedCard } from '../hooks/useRenderedCard.js';

const RATINGS = [
  { key: 'again', label: 'دوباره', en: 'Again', value: 1, cls: 'again' },
  { key: 'hard', label: 'سخت', en: 'Hard', value: 2, cls: 'hard' },
  { key: 'good', label: 'خوب', en: 'Good', value: 3, cls: 'good' },
  { key: 'easy', label: 'آسان', en: 'Easy', value: 4, cls: 'easy' },
];

export default function StudyView({ card, onAnswer, intervals, onUndo, onEdit, onSuspend }) {
  const [showBack, setShowBack] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const content = useRenderedCard(card);
  const faceRef = useRef(null);

  useEffect(() => {
    setShowBack(false);
  }, [card]);

  // پخش خودکار صدای موجود در رویِ نمایش‌داده‌شده.
  const playVisibleAudio = useCallback(() => {
    const audios = faceRef.current?.querySelectorAll('audio.card-audio');
    if (audios && audios.length) {
      audios[0].currentTime = 0;
      audios[0].play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!content.loading) {
      const t = setTimeout(playVisibleAudio, 120);
      return () => clearTimeout(t);
    }
  }, [content.loading, showBack, playVisibleAudio]);

  const handleKey = useCallback(
    (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.key === 'z' && onUndo) { e.preventDefault(); onUndo(); return; }
      if (e.key === 'e' && onEdit) { e.preventDefault(); onEdit(); return; }
      if (e.key === 'r') { e.preventDefault(); playVisibleAudio(); return; }
      if (e.key === '-' && onSuspend) { e.preventDefault(); onSuspend(); return; }
      if (!showBack) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setShowBack(true); }
        return;
      }
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < 4) onAnswer(RATINGS[idx].value);
    },
    [showBack, onAnswer, onUndo, onEdit, onSuspend, playVisibleAudio],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  if (!card) return <p className="empty">کارتی نیست. / No cards.</p>;

  return (
    <div className="study">
      {content.css && <style>{content.css}</style>}

      <div
        ref={faceRef}
        className="flashcard card"
        role="button"
        tabIndex={0}
        aria-label={showBack ? 'پاسخ کارت / Card answer' : 'سؤال کارت — برای دیدن پاسخ کلیک کن'}
        onClick={(e) => {
          if (e.target.tagName === 'IMG') { setLightbox(e.target.src); return; }
          if (!showBack) setShowBack(true);
        }}
      >
        {content.loading ? (
          <div className="spinner" />
        ) : (
          <div className="face" dir="auto">
            <div dangerouslySetInnerHTML={{ __html: showBack ? content.answer : content.question }} />
          </div>
        )}
        <button className="replay-btn" title="پخش صدا / Replay (r)" onClick={(e) => { e.stopPropagation(); playVisibleAudio(); }}>🔊</button>
      </div>

      {!showBack ? (
        <>
          <p className="tap-hint">برای دیدن پاسخ ضربه بزن یا Space / Tap or press Space</p>
          <button className="btn primary block show-answer" onClick={() => setShowBack(true)}>نمایش پاسخ / Show answer</button>
        </>
      ) : (
        <div className="rating-grid">
          {RATINGS.map((r) => (
            <button key={r.key} className={`rating ${r.cls}`} onClick={() => onAnswer(r.value)}>
              <span className="ivl">{intervals?.[r.key] || ''}</span>
              <span className="lbl">{r.label}</span>
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
        </div>
      )}
    </div>
  );
}
