// src/lib/supabase/sync.js
// همگام‌سازی کتابخانه‌ی مشترک + پیشرفت شخصی:
// - کشیدن افزایشی (updated_at) برای محتوا و پیشرفت
// - حذف نرم (deleted)
// - صف عمومی آفلاین (syncq): پیشرفت، ویرایش نوت، جابه‌جایی کارت، شمارنده‌ی روزانه
// - تفکیک خطای شبکه از خطای ردیف تا یک آیتم خراب کل صف را قفل نکند
import { supabase } from './client.js';
import db from '../database/db.js';
import { getModel, getMedia, getConfig, setConfig } from '../database/models.js';
import { State } from '../algorithms/fsrs.js';
import { dayNumber } from '../day.js';

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
const LAST_PULL_KEY = 'cloudLastPulledAt';
const LAST_PROGRESS_KEY = 'cloudLastProgressAt';
const MAX_ATTEMPTS = 3;
const EPOCH = '1970-01-01T00:00:00Z';

/* ==================== صف همگام‌سازی (offline-safe) ==================== */

// خطای شبکه (باید بعداً دوباره تلاش شود) در برابر خطای داده (ردیف مشکل دارد).
function isNetworkError(err) {
  if (!navigator.onLine) return true;
  if (!err) return false;
  if (err.code && /^\d{5}$/.test(String(err.code))) return false; // کد خطای Postgres
  const msg = String(err.message || err).toLowerCase();
  return msg.includes('fetch') || msg.includes('network') || msg.includes('timeout')
    || msg.includes('econn') || err.status === 0 || err.status === 429
    || (err.status >= 500 && err.status < 600);
}

async function enqueue(kind, key, payload) {
  const existing = await db.syncq.where('[kind+key]').equals([kind, String(key)]).first();
  if (existing) {
    await db.syncq.update(existing.id, { payload, updatedAt: Date.now(), attempts: 0 });
  } else {
    await db.syncq.add({ kind, key: String(key), payload, updatedAt: Date.now(), attempts: 0 });
  }
  flushQueue().catch(() => {});
}

// ارسال یک آیتم صف؛ خروجی: خطای Supabase یا null
async function sendItem(item) {
  const p = item.payload;
  if (item.kind === 'progress') {
    return (await supabase.from('progress').upsert({
      user_id: _userId, card_id: item.key, ...p, updated_at: new Date().toISOString(),
    })).error;
  }
  if (item.kind === 'note') {
    return (await supabase.from('notes').update(p).eq('id', item.key)).error;
  }
  if (item.kind === 'cardMove') {
    return (await supabase.from('cards').update(p).eq('id', item.key)).error;
  }
  if (item.kind === 'daily') {
    return (await supabase.from('daily').upsert({
      user_id: _userId, ...p, updated_at: new Date().toISOString(),
    })).error;
  }
  return null; // نوع ناشناخته → دور انداخته می‌شود
}

let _flushing = false;
export async function flushQueue() {
  if (_flushing || !_userId) return { flushed: 0, remaining: await db.syncq.count() };
  _flushing = true;
  let flushed = 0, dropped = 0;
  try {
    const rows = await db.syncq.orderBy('updatedAt').toArray();
    for (const r of rows) {
      let error = null;
      try {
        error = await sendItem(r);
      } catch (e) {
        error = e;
      }
      if (!error) {
        await db.syncq.delete(r.id);
        flushed++;
        continue;
      }
      if (isNetworkError(error)) break; // آفلاین/سرور — بقیه بماند برای بعد
      // خطای مربوط به همین ردیف: چند بار تلاش، سپس دور انداختن تا صف قفل نشود.
      const attempts = (r.attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        console.warn('sync: dropping bad queue item', r.kind, r.key, error?.message);
        await db.syncq.delete(r.id);
        dropped++;
      } else {
        await db.syncq.update(r.id, { attempts });
      }
    }
  } finally {
    _flushing = false;
  }
  return { flushed, dropped, remaining: await db.syncq.count() };
}

export async function pendingCount() {
  return db.syncq.count();
}

/* ==================== ثبت تغییرات محلی در صف ==================== */

function progressPayload(card) {
  return {
    state: card.state, due: Math.round(card.due || Date.now()), interval: card.interval || 0,
    stability: card.stability, difficulty: card.difficulty, ease: card.easeFactor || 2.5,
    reps: card.reps || 0, lapses: card.lapses || 0, learning_step: card.learningStep || 0,
    last_review: card.lastReview ? Math.round(card.lastReview) : null,
  };
}

export async function enqueueProgress(card) {
  if (!card?.cloudId) return;
  await enqueue('progress', card.cloudId, progressPayload(card));
}

// ویرایش نوت (فیلدها/برچسب‌ها) — فقط اگر در ابر ثبت شده باشد.
export async function enqueueNoteEdit(note) {
  if (!note?.cloudId) return;
  await enqueue('note', note.cloudId, {
    fields: note.fields, tags: note.tags || [], model_id: String(note.modelId),
  });
}

// جابه‌جایی نوت بین دک‌ها (نوت + همه‌ی کارت‌هایش).
export async function enqueueNoteMove(localNoteId, newLocalDeckId) {
  const note = await db.notes.get(Number(localNoteId));
  const deck = await db.decks.get(Number(newLocalDeckId));
  if (!note?.cloudId || !deck?.cloudId) return;
  await enqueue('note', note.cloudId, {
    fields: note.fields, tags: note.tags || [], model_id: String(note.modelId), deck_id: deck.cloudId,
  });
  const cards = await db.cards.where('noteId').equals(note.id).toArray();
  for (const c of cards) {
    if (c.cloudId) await enqueue('cardMove', c.cloudId, { deck_id: deck.cloudId });
  }
}

// شمارنده‌ی روزانه‌ی کاربر برای یک دک (تا محدودیت بین دستگاه‌ها مشترک باشد).
export async function enqueueDaily(deck) {
  if (!deck?.cloudId || !deck.daily) return;
  await enqueue('daily', `${deck.cloudId}:${deck.daily.day}`, {
    deck_id: deck.cloudId, day: deck.daily.day,
    new_done: deck.daily.newDone || 0, rev_done: deck.daily.revDone || 0,
  });
}

/* ==================== کشیدن کتابخانه‌ی مشترک ==================== */

export async function pullShared({ full = false } = {}) {
  const since = full ? null : await getConfig(LAST_PULL_KEY, null);
  const sel = (table) => {
    let q = supabase.from(table).select('*');
    if (since) q = q.gt('updated_at', since);
    return q;
  };
  const [models, decks, notes, cards] = await Promise.all([
    sel('models'), sel('decks'), sel('notes'), sel('cards'),
  ]);
  for (const r of [models, decks, notes, cards]) if (r.error) throw r.error;

  const now = Date.now();
  let maxUpdated = since || EPOCH;
  const track = (rows) => {
    for (const r of rows || []) if (r.updated_at && r.updated_at > maxUpdated) maxUpdated = r.updated_at;
  };
  track(models.data); track(decks.data); track(notes.data); track(cards.data);

  // تغییرات محلیِ هنوز ارسال‌نشده نباید با نسخه‌ی ابری بازنویسی شوند.
  const queued = await db.syncq.toArray();
  const pendingNotes = new Set(queued.filter((q) => q.kind === 'note').map((q) => q.key));

  /* --- models --- */
  const modelPuts = [];
  for (const m of models.data || []) {
    if (m.deleted) { await db.models.delete(m.mid); continue; }
    modelPuts.push({ mid: m.mid, name: m.name, type: m.type, flds: m.flds, tmpls: m.tmpls, css: m.css });
  }
  if (modelPuts.length) await db.models.bulkPut(modelPuts);

  /* --- decks --- */
  const localDecks = await db.decks.toArray();
  const deckByCloud = new Map(localDecks.filter((d) => d.cloudId).map((d) => [d.cloudId, d.id]));
  const deckAdds = [], deckUpdates = [];
  for (const d of decks.data || []) {
    const localId = deckByCloud.get(d.id);
    if (d.deleted) { if (localId != null) await removeLocalDeck(localId); continue; }
    if (localId != null) {
      deckUpdates.push({ id: localId, changes: { name: d.name, scheduler: d.scheduler, config: d.config || DEFAULT_CFG, owner: d.owner } });
    } else {
      deckAdds.push({ cloud: d.id, row: { name: d.name, scheduler: d.scheduler || 'fsrs', config: d.config || { ...DEFAULT_CFG }, cloudId: d.id, owner: d.owner, createdAt: now, modifiedAt: now } });
    }
  }
  for (const u of deckUpdates) await db.decks.update(u.id, u.changes);
  if (deckAdds.length) {
    const ids = await db.decks.bulkAdd(deckAdds.map((x) => x.row), { allKeys: true });
    deckAdds.forEach((x, i) => deckByCloud.set(x.cloud, ids[i]));
  }

  /* --- notes --- */
  const localNotes = await db.notes.toArray();
  const noteByCloud = new Map(localNotes.filter((n) => n.cloudId).map((n) => [n.cloudId, n.id]));
  const noteAdds = [];
  for (const n of notes.data || []) {
    const localId = noteByCloud.get(n.id);
    if (n.deleted) {
      if (localId != null) { await db.cards.where('noteId').equals(localId).delete(); await db.notes.delete(localId); }
      continue;
    }
    if (pendingNotes.has(n.id)) continue; // ویرایش محلیِ ارسال‌نشده مقدم است
    const localDeck = deckByCloud.get(n.deck_id);
    if (localId != null) {
      await db.notes.update(localId, { fields: n.fields, tags: n.tags || [], modelId: n.model_id, deckId: localDeck, owner: n.owner });
    } else {
      noteAdds.push({ cloud: n.id, row: { deckId: localDeck, modelId: n.model_id, fields: n.fields, tags: n.tags || [], guid: n.guid, cloudId: n.id, owner: n.owner, createdAt: now, modifiedAt: now } });
    }
  }
  if (noteAdds.length) {
    const ids = await db.notes.bulkAdd(noteAdds.map((x) => x.row), { allKeys: true });
    noteAdds.forEach((x, i) => noteByCloud.set(x.cloud, ids[i]));
  }

  /* --- cards --- */
  const localCards = await db.cards.toArray();
  const cardByCloud = new Map(localCards.filter((c) => c.cloudId).map((c) => [c.cloudId, c.id]));
  const cardAdds = [];
  for (const c of cards.data || []) {
    const localId = cardByCloud.get(c.id);
    if (c.deleted) { if (localId != null) await db.cards.delete(localId); continue; }
    if (localId != null) {
      // زمان‌بندی شخصی حفظ می‌شود؛ فقط جابه‌جایی دک اعمال شود.
      const localDeck = deckByCloud.get(c.deck_id);
      const existing = localCards.find((x) => x.id === localId);
      if (localDeck != null && existing && existing.deckId !== localDeck) {
        await db.cards.update(localId, { deckId: localDeck });
      }
      continue;
    }
    cardAdds.push({
      noteId: noteByCloud.get(c.note_id), deckId: deckByCloud.get(c.deck_id),
      ord: c.ord || 0, pos: c.pos || 0, cloudId: c.id,
      state: State.New, queue: Queue.New, due: now, interval: 0, easeFactor: 2.5,
      stability: null, difficulty: null, learningStep: 0, reps: 0, lapses: 0, lastReview: null,
      createdAt: now, modifiedAt: now,
    });
  }
  if (cardAdds.length) await db.cards.bulkAdd(cardAdds);

  await setConfig(LAST_PULL_KEY, maxUpdated);
  return { decks: (decks.data || []).length, notes: (notes.data || []).length, cards: (cards.data || []).length };
}

async function removeLocalDeck(localDeckId) {
  await db.transaction('rw', db.decks, db.notes, db.cards, async () => {
    await db.cards.where('deckId').equals(localDeckId).delete();
    await db.notes.where('deckId').equals(localDeckId).delete();
    await db.decks.delete(localDeckId);
  });
}

/* ==================== پیشرفت شخصی (افزایشی + حل تعارض) ==================== */

export async function pullProgress(userId, { full = false } = {}) {
  const since = full ? null : await getConfig(LAST_PROGRESS_KEY, null);
  let q = supabase.from('progress').select('*').eq('user_id', userId);
  if (since) q = q.gt('updated_at', since);
  const { data, error } = await q;
  if (error) throw error;

  // پیشرفت‌های محلیِ در صف، جدیدتر از ابر هستند → بازنویسی نشوند.
  const queued = await db.syncq.toArray();
  const pendingProgress = new Set(queued.filter((x) => x.kind === 'progress').map((x) => x.key));

  const localCards = await db.cards.toArray();
  const byCloud = new Map(localCards.filter((c) => c.cloudId).map((c) => [c.cloudId, c]));

  let maxUpdated = since || EPOCH;
  let applied = 0;
  for (const p of data || []) {
    if (p.updated_at && p.updated_at > maxUpdated) maxUpdated = p.updated_at;
    const c = byCloud.get(p.card_id);
    if (!c || pendingProgress.has(p.card_id)) continue;
    // حل تعارض: اگر مرور محلی جدیدتر است، نسخه‌ی ابری اعمال نشود.
    const cloudReview = p.last_review ? Number(p.last_review) : 0;
    const localReview = c.lastReview ? Number(c.lastReview) : 0;
    if (localReview > cloudReview) continue;
    await db.cards.update(c.id, {
      state: p.state, due: Number(p.due), interval: p.interval,
      stability: p.stability, difficulty: p.difficulty, easeFactor: p.ease,
      reps: p.reps, lapses: p.lapses, learningStep: p.learning_step,
      lastReview: cloudReview || null, queue: stateToQueue(p.state),
    });
    applied++;
  }
  await setConfig(LAST_PROGRESS_KEY, maxUpdated);
  return applied;
}

// شمارنده‌های روزانه‌ی امروز را از ابر بگیر و با محلی ادغام کن (بیشترین مقدار).
export async function pullDaily(userId) {
  const today = dayNumber();
  const { data, error } = await supabase.from('daily')
    .select('*').eq('user_id', userId).eq('day', today);
  if (error) return 0;
  const decks = await db.decks.toArray();
  const byCloud = new Map(decks.filter((d) => d.cloudId).map((d) => [d.cloudId, d]));
  let n = 0;
  for (const row of data || []) {
    const deck = byCloud.get(row.deck_id);
    if (!deck) continue;
    const local = deck.daily && deck.daily.day === today ? deck.daily : { day: today, newDone: 0, revDone: 0 };
    const merged = {
      day: today,
      newDone: Math.max(local.newDone || 0, row.new_done || 0),
      revDone: Math.max(local.revDone || 0, row.rev_done || 0),
    };
    await db.decks.update(deck.id, { daily: merged });
    n++;
  }
  return n;
}

/* ==================== آپلود دک محلی ==================== */

async function batchInsertReturn(table, rows, size = 200) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) {
    const { data, error } = await supabase.from(table).insert(rows.slice(i, i + size)).select('id');
    if (error) throw error;
    out.push(...data);
  }
  return out;
}

/**
 * اجرای موازی با محدودیت هم‌زمانی — به‌جای آپلود یکی‌یکی.
 * سرعت را چند برابر می‌کند چون رفت‌وبرگشت‌ها هم‌پوشانی پیدا می‌کنند.
 */
async function runPool(items, worker, concurrency = 8, onTick) {
  let next = 0, done = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try { await worker(item); } catch { /* best-effort */ }
      onTick?.(++done);
    }
  });
  await Promise.all(runners);
}

// فهرست فایل‌هایی که قبلاً در Storage آپلود شده‌اند (برای ازسرگیری و پرش).
async function listUploadedMedia(prefix) {
  const found = new Set();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from('media')
      .list(prefix, { limit: PAGE, offset });
    if (error || !data?.length) break;
    for (const f of data) found.add(f.name);
    if (data.length < PAGE) break;
  }
  return found;
}

// حجم تقریبی مدیای یک دک (بایت) — برای هشدار سهمیه.
export async function estimateDeckMedia(localDeckId) {
  const notes = await db.notes.where('deckId').equals(Number(localDeckId)).toArray();
  const names = collectMediaNames(notes);
  let bytes = 0;
  for (const name of names) {
    const rec = await getMedia(name);
    if (rec?.blob) bytes += rec.blob.size;
  }
  return { count: names.length, bytes };
}

export async function pushDeckTree(localDeckId, userId, onProgress, { skipMedia = false } = {}) {
  const deck = await db.decks.get(Number(localDeckId));
  if (!deck) return;

  let cloudDeckId = deck.cloudId;
  if (!cloudDeckId) {
    const { data, error } = await supabase.from('decks')
      .insert({ name: deck.name, scheduler: deck.scheduler || 'fsrs', config: deck.config || DEFAULT_CFG, owner: userId })
      .select('id').single();
    if (error) throw error;
    cloudDeckId = data.id;
    await db.decks.update(deck.id, { cloudId: cloudDeckId, owner: userId });
  }

  const notes = await db.notes.where('deckId').equals(deck.id).toArray();
  for (const mid of [...new Set(notes.map((n) => n.modelId))]) {
    const m = await getModel(mid);
    await supabase.from('models').upsert({ mid: String(mid), name: m.name, type: m.type, flds: m.flds, tmpls: m.tmpls, css: m.css, owner: userId });
  }

  const newNotes = notes.filter((n) => !n.cloudId);
  if (newNotes.length) {
    const rows = newNotes.map((n) => ({ deck_id: cloudDeckId, model_id: String(n.modelId), fields: n.fields, tags: n.tags || [], guid: n.guid, owner: userId }));
    const inserted = await batchInsertReturn('notes', rows);
    for (let i = 0; i < newNotes.length; i++) {
      await db.notes.update(newNotes[i].id, { cloudId: inserted[i].id, owner: userId });
    }
    onProgress?.({ phase: 'notes', done: newNotes.length });
  }

  const allNotes = await db.notes.where('deckId').equals(deck.id).toArray();
  const noteCloud = new Map(allNotes.map((n) => [n.id, n.cloudId]));

  const cards = await db.cards.where('deckId').equals(deck.id).toArray();
  const newCards = cards.filter((c) => !c.cloudId);
  if (newCards.length) {
    const rows = newCards.map((c) => ({ note_id: noteCloud.get(c.noteId), deck_id: cloudDeckId, ord: c.ord || 0, pos: c.pos || 0, owner: userId }));
    const inserted = await batchInsertReturn('cards', rows);
    for (let i = 0; i < newCards.length; i++) await db.cards.update(newCards[i].id, { cloudId: inserted[i].id });
    onProgress?.({ phase: 'cards', done: newCards.length });
  }

  // --- مدیا: موازی، قابل‌ازسرگیری، زیر پوشه‌ی دک (تا نام‌های تکراری تداخل نکنند) ---
  const names = collectMediaNames(notes);
  let uploaded = 0, skipped = 0;

  if (names.length && !skipMedia) {
    // آنچه قبلاً آپلود شده دوباره فرستاده نمی‌شود → ازسرگیری سریع پس از قطع شدن.
    let already = new Set();
    try { already = await listUploadedMedia(cloudDeckId); } catch { /* ignore */ }
    const todo = names.filter((n) => !already.has(n));
    skipped = names.length - todo.length;

    onProgress?.({ phase: 'media', done: skipped, total: names.length, skipped });

    await runPool(
      todo,
      async (name) => {
        const rec = await getMedia(name);
        if (!rec?.blob) return;
        await supabase.storage.from('media')
          .upload(`${cloudDeckId}/${name}`, rec.blob, { contentType: rec.blob.type });
      },
      8,
      (n) => {
        uploaded = n;
        if (n % 10 === 0 || n === todo.length) {
          onProgress?.({ phase: 'media', done: skipped + n, total: names.length, skipped });
        }
      },
    );
  }

  // ثبت وضعیت آپلود روی خود دک تا در فهرست دک‌ها نمایش داده شود.
  await db.decks.update(deck.id, {
    cloudSync: {
      at: Date.now(),
      mediaTotal: names.length,
      mediaDone: skipMedia ? 0 : skipped + uploaded,
      skipMedia,
    },
  });

  return {
    cloudDeckId, notes: newNotes.length, cards: newCards.length,
    media: names.length, mediaUploaded: uploaded, mediaSkipped: skipped,
  };
}

/**
 * بررسی واقعیِ کامل‌بودن آپلود یک دک (با پرس‌وجو از ابر).
 * @returns {object} {complete, notesLocal, notesCloud, cardsLocal, cardsCloud, mediaLocal, mediaCloud}
 */
export async function verifyDeckUpload(localDeckId) {
  const deck = await db.decks.get(Number(localDeckId));
  if (!deck) return null;
  if (!deck.cloudId) return { complete: false, uploaded: false };

  const notes = await db.notes.where('deckId').equals(deck.id).toArray();
  const cards = await db.cards.where('deckId').equals(deck.id).toArray();

  const [nRes, cRes] = await Promise.all([
    supabase.from('notes').select('id', { count: 'exact', head: true }).eq('deck_id', deck.cloudId).eq('deleted', false),
    supabase.from('cards').select('id', { count: 'exact', head: true }).eq('deck_id', deck.cloudId).eq('deleted', false),
  ]);

  const mediaLocal = collectMediaNames(notes);
  let mediaCloud = 0;
  try { mediaCloud = (await listUploadedMedia(deck.cloudId)).size; } catch { mediaCloud = -1; }

  const notesCloud = nRes.count ?? 0;
  const cardsCloud = cRes.count ?? 0;
  const complete =
    notesCloud >= notes.length &&
    cardsCloud >= cards.length &&
    (mediaCloud === -1 || mediaCloud >= mediaLocal.length);

  const status = {
    uploaded: true, complete,
    notesLocal: notes.length, notesCloud,
    cardsLocal: cards.length, cardsCloud,
    mediaLocal: mediaLocal.length, mediaCloud,
  };

  await db.decks.update(deck.id, {
    cloudSync: { at: Date.now(), mediaTotal: mediaLocal.length, mediaDone: Math.max(0, mediaCloud), verified: complete },
  });
  return status;
}

export async function pushAllLocalDecks(userId, onProgress, opts = {}) {
  const decks = await db.decks.toArray();
  // دک‌هایی که هنوز آپلود نشده‌اند، و آن‌هایی که آپلودشان ناتمام مانده.
  const pending = decks.filter((d) => !d.cloudId);
  const resumable = opts.includeResume ? decks.filter((d) => d.cloudId) : [];
  const all = [...pending, ...resumable];
  let i = 0;
  for (const d of all) {
    onProgress?.({ deck: d.name, index: ++i, total: all.length });
    await pushDeckTree(d.id, userId, onProgress, opts);
  }
  return { uploaded: pending.length, resumed: resumable.length };
}

export async function cloudDeleteDeck(cloudDeckId) {
  if (!cloudDeckId) return;
  await supabase.from('cards').update({ deleted: true }).eq('deck_id', cloudDeckId);
  await supabase.from('notes').update({ deleted: true }).eq('deck_id', cloudDeckId);
  await supabase.from('decks').update({ deleted: true }).eq('id', cloudDeckId);
}

export async function cloudDeleteNote(cloudNoteId) {
  if (!cloudNoteId) return;
  await supabase.from('cards').update({ deleted: true }).eq('note_id', cloudNoteId);
  await supabase.from('notes').update({ deleted: true }).eq('id', cloudNoteId);
}

/* ==================== همگام‌سازی کامل ==================== */

export async function syncNow(userId) {
  await flushQueue();
  const pulled = await pullShared();
  await pullProgress(userId);
  await pullDaily(userId);
  return pulled;
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
