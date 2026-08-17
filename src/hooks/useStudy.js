import { useState, useCallback, useEffect, useRef } from 'react';
import { buildStudyQueue, answerCard, previewIntervals } from '../lib/scheduler/scheduler.js';
import { State } from '../lib/algorithms/fsrs.js';
import { updateCard, updateDeck } from '../lib/database/models.js';
import db from '../lib/database/db.js';
import { cloudEnabled } from '../lib/supabase/client.js';
import { enqueueProgress, enqueueDaily } from '../lib/supabase/sync.js';

// کارت بعدی: ابتدا کارت‌های سررسیده (با کمترین due)، وگرنه نزدیک‌ترین کارت آینده.
function pickNext(pool, now) {
  if (!pool.length) return null;
  const due = pool.filter((c) => (c.due ?? 0) <= now);
  const arr = due.length ? due : pool;
  return arr.reduce((m, c) => ((c.due ?? 0) < (m.due ?? 0) ? c : m), arr[0]);
}

export function useStudy(deckId, options = {}) {
  const { mode, tag, limit } = options;
  const [deck, setDeck] = useState(null);
  const [pool, setPool] = useState([]);
  const [current, setCurrent] = useState(null);
  const [isComplete, setIsComplete] = useState(false);
  const [stats, setStats] = useState({ answered: 0, correct: 0 });
  const [loading, setLoading] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [isCram, setIsCram] = useState(false);

  const poolRef = useRef([]);
  const deckRef = useRef(null);
  const undoRef = useRef(null);
  const cramRef = useRef(false);

  const apply = useCallback((p) => {
    poolRef.current = p;
    setPool(p);
    // در حالت فشرده ترتیب ثابت است (سررسید معنا ندارد).
    const n = cramRef.current ? (p[0] || null) : pickNext(p, Date.now());
    setCurrent(n);
    setIsComplete(!n);
  }, []);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const { queue, deck: d, cram } = await buildStudyQueue(deckId, { mode, tag, limit });
      deckRef.current = d;
      cramRef.current = !!cram;
      setIsCram(!!cram);
      setDeck(d);
      setStats({ answered: 0, correct: 0 });
      setCanUndo(false);
      undoRef.current = null;
      apply(queue);
    } catch (e) {
      console.error('Failed to build study queue:', e);
      setIsComplete(true);
    } finally {
      setLoading(false);
    }
  }, [deckId, mode, tag, limit, apply]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleAnswer = useCallback(async (rating) => {
    const card = current;
    if (!card) return;

    // حالت فشرده: زمان‌بندی واقعی دست‌نخورده می‌ماند.
    if (cramRef.current) {
      setStats((p) => ({ answered: p.answered + 1, correct: p.correct + (rating >= 3 ? 1 : 0) }));
      let rest = poolRef.current.filter((c) => c.id !== card.id);
      if (rating === 1) rest = [...rest, card]; // «دوباره» در همین جلسه تکرار شود
      apply(rest);
      return;
    }

    const d = deckRef.current;
    const dailyBefore = d?.daily ? { ...d.daily } : null;
    const snapshot = { ...card };

    const updated = await answerCard(card, rating, d);

    // ثبت پیشرفت و شمارنده‌ی روزانه در صف آفلاین؛ هنگام آنلاین‌بودن خودکار به ابر می‌رود.
    if (cloudEnabled) {
      if (updated.cloudId) enqueueProgress(updated).catch(() => {});
      if (deckRef.current?.cloudId) enqueueDaily(deckRef.current).catch(() => {});
    }

    undoRef.current = { snapshot, dailyBefore, rating };
    setCanUndo(true);
    setStats((p) => ({ answered: p.answered + 1, correct: p.correct + (rating >= 3 ? 1 : 0) }));

    let rest = poolRef.current.filter((c) => c.id !== card.id);
    if (updated.state === State.Learning || updated.state === State.Relearning) {
      rest = [...rest, updated];
    }
    apply(rest);
  }, [current, apply]);

  const undo = useCallback(async () => {
    const u = undoRef.current;
    if (!u) return;
    await updateCard(u.snapshot.id, u.snapshot);
    if (u.dailyBefore && deckRef.current) {
      await updateDeck(deckRef.current.id, { daily: u.dailyBefore });
      deckRef.current.daily = u.dailyBefore;
    }
    try {
      const last = await db.revlog.where('cardId').equals(u.snapshot.id).last();
      if (last) await db.revlog.delete(last.id);
    } catch { /* ignore */ }

    setStats((p) => ({
      answered: Math.max(0, p.answered - 1),
      correct: Math.max(0, p.correct - (u.rating >= 3 ? 1 : 0)),
    }));
    undoRef.current = null;
    setCanUndo(false);
    apply([u.snapshot, ...poolRef.current.filter((c) => c.id !== u.snapshot.id)]);
  }, [apply]);

  const preview = useCallback(
    (card) => (deck && card ? previewIntervals(card, deck) : null),
    [deck],
  );

  return {
    deck, queue: pool, currentCard: current, isComplete, stats, loading, canUndo, isCram,
    handleAnswer, undo, loadQueue, preview,
  };
}
