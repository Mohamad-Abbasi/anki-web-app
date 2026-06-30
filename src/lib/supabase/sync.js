// src/lib/supabase/sync.js
// همگام‌سازی کتابخانه‌ی مشترک (decks/notes/cards/models/media) و پیشرفت شخصی.
import { supabase } from './client.js';
import db from '../database/db.js';
import { getModel, getMedia } from '../database/models.js';
import { State } from '../algorithms/fsrs.js';

// شناسه‌ی کاربر فعلی (توسط AuthContext تنظیم می‌شود) تا لایه‌های غیر-React هم بدانند.
let _userId = null;
export function setSyncUser(id) { _userId = id; }
export function getSyncUser() { return _userId; }

const Queue = { New: 0, Learning: 1, Review: 2, Suspended: -1 };
function stateToQueue(state) {
  if (state === State.New) return Queue.New;
  if (state === State.Review) return Queue.Review;
  return Queue.Learning;
}
const DEFAULT_CFG = {
  newPerDay: 20, reviewsPerDay: 200, requestRetention: 0.9, maxInterval: 36500,
  learningSteps: [1, 10], relearningSteps: [10], graduatingInterval: 1, easyInterval: 4,
};

// ---------- کشیدن کتابخانه‌ی مشترک به حافظه‌ی محلی ----------
export async function pullShared() {
  const [models, decks, notes, cards] = await Promise.all([
    supabase.from('models').select('*'),
    supabase.from('decks').select('*'),
    supabase.from('notes').select('*'),
    supabase.from('cards').select('*'),
  ]);
  if (models.error) throw models.error;

  for (const m of models.data || []) {
    await db.models.put({ mid: m.mid, name: m.name, type: m.type, flds: m.flds, tmpls: m.tmpls, css: m.css });
  }

  const now = Date.now();
  const localDecks = await db.decks.toArray();
  const deckByCloud = new Map(localDecks.filter((d) => d.cloudId).map((d) => [d.cloudId, d.id]));
  for (const d of decks.data || []) {
    if (deckByCloud.has(d.id)) {
      await db.decks.update(deckByCloud.get(d.id), { name: d.name, scheduler: d.scheduler, config: d.config || DEFAULT_CFG });
    } else {
      const id = await db.decks.add({ name: d.name, scheduler: d.scheduler || 'fsrs', config: d.config || { ...DEFAULT_CFG }, cloudId: d.id, createdAt: now, modifiedAt: now });
      deckByCloud.set(d.id, id);
    }
  }

  const localNotes = await db.notes.toArray();
  const noteByCloud = new Map(localNotes.filter((n) => n.cloudId).map((n) => [n.cloudId, n.id]));
  for (const n of notes.data || []) {
    const localDeck = deckByCloud.get(n.deck_id);
    if (noteByCloud.has(n.id)) {
      await db.notes.update(noteByCloud.get(n.id), { fields: n.fields, tags: n.tags || [], modelId: n.model_id, deckId: localDeck });
    } else {
      const id = await db.notes.add({ deckId: localDeck, modelId: n.model_id, fields: n.fields, tags: n.tags || [], guid: n.guid, cloudId: n.id, createdAt: now, modifiedAt: now });
      noteByCloud.set(n.id, id);
    }
  }

  const localCards = await db.cards.toArray();
  const cardByCloud = new Map(localCards.filter((c) => c.cloudId).map((c) => [c.cloudId, c.id]));
  for (const c of cards.data || []) {
    if (cardByCloud.has(c.id)) continue; // زمان‌بندی محلی/شخصی حفظ می‌شود
    const id = await db.cards.add({
      noteId: noteByCloud.get(c.note_id), deckId: deckByCloud.get(c.deck_id),
      ord: c.ord || 0, pos: c.pos || 0, cloudId: c.id,
      state: State.New, queue: Queue.New, due: now, interval: 0, easeFactor: 2.5,
      stability: null, difficulty: null, learningStep: 0, reps: 0, lapses: 0, lastReview: null,
      createdAt: now, modifiedAt: now,
    });
    cardByCloud.set(c.id, id);
  }

  return { decks: (decks.data || []).length, notes: (notes.data || []).length, cards: (cards.data || []).length };
}

// ---------- پیشرفت شخصی ----------
export async function pullProgress(userId) {
  const { data, error } = await supabase.from('progress').select('*').eq('user_id', userId);
  if (error) throw error;
  const localCards = await db.cards.toArray();
  const byCloud = new Map(localCards.filter((c) => c.cloudId).map((c) => [c.cloudId, c]));
  for (const p of data || []) {
    const c = byCloud.get(p.card_id);
    if (!c) continue;
    await db.cards.update(c.id, {
      state: p.state, due: Number(p.due), interval: p.interval,
      stability: p.stability, difficulty: p.difficulty, easeFactor: p.ease,
      reps: p.reps, lapses: p.lapses, learningStep: p.learning_step,
      lastReview: p.last_review ? Number(p.last_review) : null, queue: stateToQueue(p.state),
    });
  }
  return (data || []).length;
}

export async function pushProgress(userId, card) {
  if (!card?.cloudId || !userId) return;
  await supabase.from('progress').upsert({
    user_id: userId, card_id: card.cloudId, state: card.state,
    due: Math.round(card.due || Date.now()), interval: card.interval || 0,
    stability: card.stability, difficulty: card.difficulty, ease: card.easeFactor || 2.5,
    reps: card.reps || 0, lapses: card.lapses || 0, learning_step: card.learningStep || 0,
    last_review: card.lastReview ? Math.round(card.lastReview) : null,
    updated_at: new Date().toISOString(),
  });
}

// ---------- فرستادن یک دک محلی به کتابخانه‌ی مشترک ----------
async function batchInsertReturn(table, rows, size = 200) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) {
    const { data, error } = await supabase.from(table).insert(rows.slice(i, i + size)).select('id');
    if (error) throw error;
    out.push(...data);
  }
  return out;
}

export async function pushDeckTree(localDeckId, userId, onProgress) {
  const deck = await db.decks.get(localDeckId);
  if (!deck) return;

  let cloudDeckId = deck.cloudId;
  if (!cloudDeckId) {
    const { data, error } = await supabase.from('decks')
      .insert({ name: deck.name, scheduler: deck.scheduler || 'fsrs', config: deck.config || DEFAULT_CFG, owner: userId })
      .select('id').single();
    if (error) throw error;
    cloudDeckId = data.id;
    await db.decks.update(localDeckId, { cloudId: cloudDeckId });
  }

  const notes = await db.notes.where('deckId').equals(localDeckId).toArray();

  // مدل‌های مورد استفاده
  for (const mid of [...new Set(notes.map((n) => n.modelId))]) {
    const m = await getModel(mid);
    await supabase.from('models').upsert({ mid: String(mid), name: m.name, type: m.type, flds: m.flds, tmpls: m.tmpls, css: m.css, owner: userId });
  }

  // نوت‌های بدون cloudId
  const newNotes = notes.filter((n) => !n.cloudId);
  if (newNotes.length) {
    const rows = newNotes.map((n) => ({ deck_id: cloudDeckId, model_id: String(n.modelId), fields: n.fields, tags: n.tags || [], guid: n.guid, owner: userId }));
    const inserted = await batchInsertReturn('notes', rows);
    for (let i = 0; i < newNotes.length; i++) await db.notes.update(newNotes[i].id, { cloudId: inserted[i].id });
    onProgress?.({ phase: 'notes', done: newNotes.length });
  }

  // نگاشت نوت محلی → cloud
  const allNotes = await db.notes.where('deckId').equals(localDeckId).toArray();
  const noteCloud = new Map(allNotes.map((n) => [n.id, n.cloudId]));

  const cards = await db.cards.where('deckId').equals(localDeckId).toArray();
  const newCards = cards.filter((c) => !c.cloudId);
  if (newCards.length) {
    const rows = newCards.map((c) => ({ note_id: noteCloud.get(c.noteId), deck_id: cloudDeckId, ord: c.ord || 0, pos: c.pos || 0, owner: userId }));
    const inserted = await batchInsertReturn('cards', rows);
    for (let i = 0; i < newCards.length; i++) await db.cards.update(newCards[i].id, { cloudId: inserted[i].id });
    onProgress?.({ phase: 'cards', done: newCards.length });
  }

  // مدیا → Storage (تخت، best-effort)
  const names = collectMediaNames(notes);
  let mediaDone = 0;
  for (const name of names) {
    const rec = await getMedia(name);
    if (rec?.blob) {
      try {
        await supabase.storage.from('media').upload(name, rec.blob, { upsert: true, contentType: rec.blob.type });
      } catch { /* best-effort */ }
    }
    if (++mediaDone % 100 === 0) onProgress?.({ phase: 'media', done: mediaDone, total: names.length });
  }

  return { cloudDeckId, notes: newNotes.length, cards: newCards.length, media: names.length };
}

function collectMediaNames(notes) {
  const names = new Set();
  const srcRe = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  const soundRe = /\[sound:([^\]]+)\]/g;
  for (const n of notes) {
    const text = (n.fields || []).join(' ');
    let m;
    while ((m = srcRe.exec(text))) if (!/^(https?:|data:|blob:)/i.test(m[1])) names.add(decodeURIComponent(m[1]).split('/').pop());
    while ((m = soundRe.exec(text))) names.add(m[1].split('/').pop());
  }
  return [...names];
}
