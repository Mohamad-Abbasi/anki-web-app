import { useState, useEffect, useCallback } from 'react';
import {
  getDecks, getDeckCounts, createDeck, deleteDeck, updateDeck as persistDeck,
  ensureBuiltinModels,
} from '../lib/database/models.js';

export function useDecks() {
  const [decks, setDecks] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      await ensureBuiltinModels();
      const deckList = await getDecks();
      const countMap = {};
      await Promise.all(
        deckList.map(async (deck) => {
          countMap[deck.id] = await getDeckCounts(deck.id);
        }),
      );
      setDecks(deckList);
      setCounts(countMap);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addNewDeck = useCallback(async (name, options = {}) => {
    const id = await createDeck({ name, ...options });
    await refresh();
    return id;
  }, [refresh]);

  const removeDeck = useCallback(async (deckId) => {
    await deleteDeck(deckId);
    await refresh();
  }, [refresh]);

  const updateDeck = useCallback(async (deckId, changes) => {
    await persistDeck(deckId, changes);
    await refresh();
  }, [refresh]);

  return { decks, counts, loading, error, addNewDeck, removeDeck, updateDeck, refresh };
}
