import db from '../database/db';
import { State } from '../algorithms/fsrs';
import { Queue, ensureBuiltinModels } from '../database/models';

// نگاشت type کارت Anki به state داخلی ما.
function ankiTypeToState(type) {
  switch (type) {
    case 1: return State.Learning;
    case 2: return State.Review;
    case 3: return State.Relearning;
    default: return State.New;
  }
}

// تبدیل مدل Anki به ساختار داخلی ما.
function convertModel(mid, m) {
  const flds = (m.flds || []).slice().sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));
  const tmpls = (m.tmpls || []).slice().sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));
  return {
    mid: String(mid),
    name: m.name || 'Imported Model',
    type: m.type || 0,
    flds: flds.map((f) => f.name),
    css: m.css || '',
    tmpls: tmpls.map((t) => ({ name: t.name, qfmt: t.qfmt, afmt: t.afmt })),
  };
}

/**
 * وارد کردن نتیجه‌ی parseApkg به دیتابیس محلی.
 * @param {object} parsed خروجی parseApkg
 * @param {string} fallbackName نام پیش‌فرض دک اگر apkg نام معناداری نداشت
 * @returns {object} خلاصه‌ی import
 */
export async function importParsedApkg(parsed, fallbackName = 'Imported Deck') {
  const { collection, notes, cards, mediaFiles } = parsed;
  await ensureBuiltinModels();

  // 1) ذخیره‌ی مدل‌ها
  const modelEntries = Object.entries(collection.models || {});
  for (const [mid, m] of modelEntries) {
    await db.models.put(convertModel(mid, m));
  }

  // 2) ساخت دک‌ها (نگاشت did اَنکی → id محلی)
  const ankiDecks = collection.decks || {};
  const deckIdMap = new Map();
  const usedDeckIds = new Set(cards.map((c) => c.deckId));
  const now = Date.now();

  for (const did of usedDeckIds) {
    const info = ankiDecks[did] || ankiDecks[String(did)];
    let name = info?.name;
    if (!name || name === 'Default') name = fallbackName;
    const localId = await db.decks.add({
      name,
      parentId: null,
      scheduler: 'fsrs',
      config: {
        newPerDay: 20, reviewsPerDay: 200, requestRetention: 0.9, maxInterval: 36500,
        learningSteps: [1, 10], relearningSteps: [10], graduatingInterval: 1, easyInterval: 4,
      },
      createdAt: now,
      modifiedAt: now,
    });
    deckIdMap.set(did, localId);
  }
  if (deckIdMap.size === 0) {
    const localId = await db.decks.add({
      name: fallbackName, parentId: null, scheduler: 'fsrs',
      config: { newPerDay: 20, reviewsPerDay: 200, requestRetention: 0.9, maxInterval: 36500,
        learningSteps: [1, 10], relearningSteps: [10], graduatingInterval: 1, easyInterval: 4 },
      createdAt: now, modifiedAt: now,
    });
    deckIdMap.set('__fallback__', localId);
  }
  const resolveDeck = (did) => deckIdMap.get(did) ?? deckIdMap.values().next().value;

  // 3) نوت‌ها (نگاشت nid اَنکی → id محلی) — دک نوت را از اولین کارتش می‌گیریم.
  const noteDeck = new Map();
  for (const c of cards) if (!noteDeck.has(c.noteId)) noteDeck.set(c.noteId, c.deckId);

  // نوشتن دسته‌ای (bulk) برای مقیاس‌پذیری با هزاران نوت/کارت/مدیا.
  const noteRows = notes.map((n) => ({
    deckId: resolveDeck(noteDeck.get(n.id)),
    modelId: String(n.mid),
    fields: n.fields,
    tags: n.tags || [],
    guid: n.guid,
    createdAt: now,
    modifiedAt: now,
  }));
  const localNoteIds = await db.notes.bulkAdd(noteRows, { allKeys: true });

  // نگاشت nid اَنکی → id محلی بر اساس ترتیب درج.
  const noteIdMap = new Map();
  notes.forEach((n, i) => noteIdMap.set(n.id, localNoteIds[i]));

  // 4) کارت‌ها — زمان‌بندی را برای مطالعه‌ی فوری نرمال می‌کنیم.
  const cardRows = cards.map((c) => {
    const state = ankiTypeToState(c.type);
    const interval = state === State.Review ? Math.max(1, c.interval || 1) : 0;
    return {
      noteId: noteIdMap.get(c.noteId),
      deckId: resolveDeck(c.deckId),
      ord: c.ord || 0,
      state,
      queue: c.queue < 0 ? c.queue : (state === State.Review ? Queue.Review : state === State.New ? Queue.New : Queue.Learning),
      due: now,
      interval,
      easeFactor: c.easeFactor ? c.easeFactor / 1000 : 2.5,
      stability: state === State.Review ? Math.max(1, interval) : null,
      difficulty: state === State.Review ? 5 : null,
      learningStep: 0,
      reps: c.reps || 0,
      lapses: c.lapses || 0,
      lastReview: null,
      createdAt: now,
      modifiedAt: now,
    };
  });
  await db.cards.bulkAdd(cardRows);

  // 5) مدیا — در دسته‌های ۱۰۰۰تایی تا حافظه و تراکنش‌ها سبک بمانند.
  const mediaRows = Object.entries(mediaFiles || {}).map(([name, blob]) => ({ name, blob }));
  for (let i = 0; i < mediaRows.length; i += 1000) {
    await db.media.bulkPut(mediaRows.slice(i, i + 1000));
  }

  return {
    deckCount: deckIdMap.size,
    noteCount: noteIdMap.size,
    cardCount: cards.length,
    mediaCount: mediaRows.length,
  };
}
