import { useState, useEffect, useCallback } from 'react';
import { useRenderedCard } from '../hooks/useRenderedCard.js';

const RATINGS = [
  { key: 'again', label: 'دوباره', value: 1, cls: 'again' },
  { key: 'hard', label: 'سخت', value: 2, cls: 'hard' },
  { key: 'good', label: 'خوب', value: 3, cls: 'good' },
  { key: 'easy', label: 'آسان', value: 4, cls: 'easy' },
];

export default function StudyView({ card, onAnswer, intervals }) {
  const [showBack, setShowBack] = useState(false);
  const content = useRenderedCard(card);

  useEffect(() => {
    setShowBack(false);
  }, [card]);

  const handleKey = useCallback(
    (e) => {
      if (!showBack) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setShowBack(true); }
        return;
      }
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < 4) onAnswer(RATINGS[idx].value);
    },
    [showBack, onAnswer],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  if (!card) return <p className="empty">کارتی نیست.</p>;

  return (
    <div className="study">
      {content.css && <style>{content.css}</style>}

      <div className="flashcard card" onClick={() => !showBack && setShowBack(true)}>
        {content.loading ? (
          <div className="spinner" />
        ) : (
          <div className="face" dir="auto">
            <div dangerouslySetInnerHTML={{ __html: showBack ? content.answer : content.question }} />
          </div>
        )}
      </div>

      {!showBack ? (
        <>
          <p className="tap-hint">برای دیدن پاسخ ضربه بزن یا Space</p>
          <button className="btn primary block show-answer" onClick={() => setShowBack(true)}>نمایش پاسخ</button>
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
    </div>
  );
}
