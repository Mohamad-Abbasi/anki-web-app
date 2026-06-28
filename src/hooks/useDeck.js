import { useState, useEffect, useCallback } from 'react';
import { getDeck, updateDeck as persistDeck } from '../lib/database/models.js';

export function useDeck(deckId) {
  const [deck, setDeck] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!deckId) return;
    const d = await getDeck(deckId);
    setDeck(d);
    setLoading(false);
  }, [deckId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const update = useCallback(
    async (changes) => {
      await persistDeck(deckId, changes);
      await refresh();
    },
    [deckId, refresh],
  );

  return { deck, loading, update, refresh };
}
