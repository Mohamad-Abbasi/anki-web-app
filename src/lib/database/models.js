import db from './db';
import { State } from '../algorithms/fsrs';
import { currentDaily } from '../day';

// 0=new 1=learning 2=review 3=day-learning -1=suspended -2=buried (مثل Anki)
export const Queue = {
  New: 0, Learning: 1, Review: 2, DayLearning: 3, Suspended: -1, Buried: -2,
};

export const Scheduler = { SM2: 'sm2', FSRS: 'fsrs' };

const nowMs = () => Date.now();

/* ---------- MODELS (انواع نوت) ---------- */

// مدل‌های داخلی پیش‌فرض (Basic و Cloze) — هم‌سان با Anki.
export const BUILTIN_MODELS = {
  basic: {
    mid: 'basic',
    name: 'Basic',
    type: 0, // standard
    flds: ['Front', 'Back'],
    css: '.card{font-family:inherit;font-size:1.25rem;text-align:center;}',
    tmpls: [
      { name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id="answer">{{Back}}' },
    ],
  },
  'basic-reversed': {
    mid: 'basic-reversed',
    name: 'Basic (and reversed card)',
    type: 0,
    flds: ['Front', 'Back'],
    css: '.card{font-family:inherit;font-size:1.25rem;text-align:center;}',
    tmpls: [
      { name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id="answer">{{Back}}' },
      { name: 'Card 2', qfmt: '{{Back}}', afmt: '{{FrontSide}}<hr id="answer">{{Front}}' },
    ],
  },
  cloze: {
    mid: 'cloze',
    name: 'Cloze',
    type: 1, // cloze
    flds: ['Text', 'Back Extra'],
    css: '.card{font-family:inherit;font-size:1.25rem;text-align:center;}.cloze{font-weight:bold;color:#4cc9f0;}',
    tmpls: [
      { name: 'Cloze', qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{Back Extra}}' },
    ],
  },
};

export async function ensureBuiltinModels() {
  for (const m of Object.values(BUILTIN_MODELS)) {
    const existing = await db.models.get(m.mid);
    if (!existing) await db.models.put(m);
  }
}

export async function getModel(mid) {
  return (await db.models.get(mid)) || BUILTIN_MODELS[mid] || BUILTIN_MODELS.basic;
}

export async function putModel(model) {
  return db.models.put(model);
}

export async function getModels() {
  return db.models.toArray();
}

/* ---------- DECKS ---------- */

export async function createDeck({ name, parentId = null, scheduler = Scheduler.FSRS, config = {} }) {
  const ts = nowMs();
  return db.decks.add({
    name,
    parentId,
    scheduler,
    config: {
      newPerDay: 20,
      reviewsPerDay: 200,
      requestRetention: 0.9,
      maxInterval: 36500,
      learningSteps: [1, 10],
      relearningSteps: [10],
      graduatingInterval: 1,
      easyInterval: 4,
      ...config,
    },
    createdAt: ts,
    modifiedAt: ts,
  });
}

export async function getDecks() {
  return db.decks.orderBy('name').toArray();
}

export async function getDeck(id) {
  return db.decks.get(Number(id));
}

export async function updateDeck(id, changes) {
  return db.decks.update(Number(id), { ...changes, modifiedAt: nowMs() });
}

export async function deleteDeck(id) {
  id = Number(id);
  await db.transaction('rw', db.decks, db.notes, db.cards, db.revlog, async () => {
    const cards = await db.cards.where('deckId').equals(id).toArray();
    const cardIds = cards.map((c) => c.id);
    await db.cards.where('deckId').equals(id).delete();
    await db.notes.where('deckId').equals(id).delete();
    for (const cid of cardIds) {
      await db.revlog.where('cardId').equals(cid).delete();
    }
    await db.decks.delete(id);
  });
}

export async function renameDeck(id, name) {
  return updateDeck(id, { name });
}

/* ---------- NOTES ---------- */

export async function createNote({ deckId, modelId = 'basic', fields, tags = [] }) {
  deckId = Number(deckId);
  const ts = nowMs();
  const model = await getModel(modelId);
  const noteId = await db.notes.add({
    deckId, modelId, fields, tags, createdAt: ts, modifiedAt: ts,
  });

  // تولید کارت‌ها بر اساس قالب‌های مدل (یا تعداد cloze).
  const ords = cardOrdsForNote(model, fields);
  for (const ord of ords) {
    await createCard({ noteId, deckId, ord });
  }
  return noteId;
}

// تعیین اینکه یک نوت چند کارت (و با چه ord هایی) تولید می‌کند.
export function cardOrdsForNote(model, fields) {
  if (model.type === 1) {
    // Cloze: یک کارت به ازای هر شماره‌ی cloze موجود.
    const text = (fields || []).join(' ');
    const nums = new Set();
    const re = /\{\{c(\d+)::/g;
    let m;
    while ((m = re.exec(text))) nums.add(Number(m[1]));
    if (nums.size === 0) return [0];
    return [...nums].sort((a, b) => a - b).map((n) => n - 1);
  }
  return (model.tmpls || [{}]).map((_, i) => i);
}

export async function getNote(id) {
  return db.notes.get(Number(id));
}

export async function getNotesByDeck(deckId) {
  return db.notes.where('deckId').equals(Number(deckId)).toArray();
}

export async function updateNote(id, changes) {
  return db.notes.update(Number(id), { ...changes, modifiedAt: nowMs() });
}

export async function deleteNote(id) {
  id = Number(id);
  await db.transaction('rw', db.notes, db.cards, db.revlog, async () => {
    const cards = await db.cards.where('noteId').equals(id).toArray();
    await db.cards.where('noteId').equals(id).delete();
    for (const c of cards) await db.revlog.where('cardId').equals(c.id).delete();
    await db.notes.delete(id);
  });
}

/* ---------- CARDS ---------- */

export async function createCard({ noteId, deckId, ord = 0 }) {
  const ts = nowMs();
  return db.cards.add({
    noteId: Number(noteId),
    deckId: Number(deckId),
    ord,
    state: State.New,
    queue: Queue.New,
    due: ts,
    interval: 0,
    easeFactor: 2.5,
    stability: null,
    difficulty: null,
    learningStep: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
    createdAt: ts,
    modifiedAt: ts,
  });
}

export async function getCard(id) {
  return db.cards.get(Number(id));
}

export async function getCardsByDeck(deckId) {
  return db.cards.where('deckId').equals(Number(deckId)).toArray();
}

export async function updateCard(id, changes) {
  return db.cards.update(Number(id), { ...changes, modifiedAt: nowMs() });
}

export async function setCardQueue(id, queue) {
  return updateCard(id, { queue });
}

// انتقال یک نوت و همه‌ی کارت‌هایش به دک دیگر.
export async function moveNote(noteId, newDeckId) {
  noteId = Number(noteId);
  newDeckId = Number(newDeckId);
  await db.transaction('rw', db.notes, db.cards, async () => {
    await db.notes.update(noteId, { deckId: newDeckId, modifiedAt: nowMs() });
    const cards = await db.cards.where('noteId').equals(noteId).toArray();
    for (const c of cards) await db.cards.update(c.id, { deckId: newDeckId });
  });
}

// تعلیق/لغو تعلیق همه‌ی کارت‌های یک نوت.
export async function setNoteSuspended(noteId, suspended) {
  noteId = Number(noteId);
  const cards = await db.cards.where('noteId').equals(noteId).toArray();
  for (const c of cards) {
    await updateCard(c.id, { queue: suspended ? Queue.Suspended : stateToQueue(c.state) });
  }
}

function stateToQueue(state) {
  if (state === State.New) return Queue.New;
  if (state === State.Review) return Queue.Review;
  return Queue.Learning;
}

// شمارش کارت‌های جدید/یادگیری/مرور برای داشبورد.
export async function getDeckCounts(deckId) {
  const ts = nowMs();
  const cards = await db.cards.where('deckId').equals(Number(deckId)).toArray();
  const deck = await getDeck(deckId);
  const newLimit = deck?.config?.newPerDay ?? 20;
  const reviewLimit = deck?.config?.reviewsPerDay ?? 200;
  const daily = currentDaily(deck);
  const newRemaining = Math.max(0, newLimit - daily.newDone);
  const reviewRemaining = Math.max(0, reviewLimit - daily.revDone);

  let newCount = 0, learn = 0, review = 0;
  for (const c of cards) {
    if (c.queue === Queue.Suspended || c.queue === Queue.Buried) continue;
    if (c.state === State.New) newCount++;
    else if (c.state === State.Learning || c.state === State.Relearning) {
      if ((c.due ?? 0) <= ts) learn++;
    } else if ((c.due ?? 0) <= ts) review++;
  }
  return {
    new: Math.min(newCount, newRemaining),
    learn,
    review: Math.min(review, reviewRemaining),
    total: cards.length,
  };
}

/* ---------- REVLOG ---------- */

export async function logReview(entry) {
  return db.revlog.add({ ...entry, reviewedAt: entry.reviewedAt ?? nowMs() });
}

export async function getRevlog(limit = 5000) {
  return db.revlog.orderBy('reviewedAt').reverse().limit(limit).toArray();
}

/* ---------- CONFIG ---------- */

export async function getConfig(key, defaultValue = null) {
  const row = await db.config.get(key);
  return row ? row.value : defaultValue;
}

export async function setConfig(key, value) {
  return db.config.put({ key, value });
}

/* ---------- MEDIA ---------- */

export async function saveMedia(name, blob) {
  return db.media.put({ name, blob });
}

export async function getMedia(name) {
  return db.media.get(name);
}
