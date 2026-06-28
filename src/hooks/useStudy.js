import { useState, useCallback, useEffect, useRef } from 'react';
import { buildStudyQueue, answerCard, previewIntervals } from '../lib/scheduler/scheduler.js';
import { State } from '../lib/algorithms/fsrs.js';

export function useStudy(deckId) {
  const [deck, setDeck] = useState(null);
  const [queue, setQueue] = useState([]);
  const [currentCard, setCurrentCard] = useState(null);
  const [isComplete, setIsComplete] = useState(false);
  const [stats, setStats] = useState({ answered: 0, correct: 0 });
  const [loading, setLoading] = useState(true);
  const queueRef = useRef([]);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const { queue: q, deck: d } = await buildStudyQueue(deckId);
      queueRef.current = q;
      setDeck(d);
      setQueue(q);
      setCurrentCard(q[0] || null);
      setIsComplete(q.length === 0);
      setStats({ answered: 0, correct: 0 });
    } catch (e) {
      console.error('Failed to build study queue:', e);
      setIsComplete(true);
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleAnswer = useCallback(async (rating) => {
    const card = queueRef.current[0];
    if (!card) return;

    const updated = await answerCard(card, rating, deck);
    setStats((p) => ({ answered: p.answered + 1, correct: p.correct + (rating >= 3 ? 1 : 0) }));

    let rest = queueRef.current.slice(1);
    // کارت‌های در حال یادگیری در همین جلسه دوباره نمایش داده می‌شوند.
    if (updated.state === State.Learning || updated.state === State.Relearning) {
      rest = [...rest, updated];
    }
    queueRef.current = rest;
    setQueue(rest);
    setCurrentCard(rest[0] || null);
    setIsComplete(rest.length === 0);
  }, [deck]);

  const preview = useCallback(
    (card) => (deck && card ? previewIntervals(card, deck) : null),
    [deck],
  );

  return {
    deck, queue, currentCard, isComplete, stats, loading,
    handleAnswer, loadQueue, preview,
  };
}
