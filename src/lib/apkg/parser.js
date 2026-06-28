import { unzipSync, strFromU8 } from 'fflate';
import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let SQL = null;

async function getSQL() {
  if (!SQL) {
    SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  }
  return SQL;
}

function parseCollectionData(dbJson) {
  let parsed = {};
  try {
    parsed = JSON.parse(dbJson || '{}');
  } catch {
    parsed = {};
  }
  return {
    schemaVersion: parsed.schemaVer || 11,
    config: parsed.config || {},
    decks: parsed.decks || {},
    models: parsed.models || {},
    tags: parsed.tags || [],
    css: parsed.css || '',
  };
}

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
  m4a: 'audio/mp4', flac: 'audio/flac', mp4: 'video/mp4', webm: 'video/webm',
  mov: 'video/quicktime', pdf: 'application/pdf', txt: 'text/plain',
};

function mimeFor(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

/**
 * پارس کردن یک فایل .apkg و استخراج کالکشن، نوت‌ها، کارت‌ها، لاگ و مدیا.
 * از هر دو طرح‌واره‌ی collection.anki21 و collection.anki2 پشتیبانی می‌کند.
 */
export async function parseApkg(file) {
  const SQLlib = await getSQL();
  const arrayBuffer = await file.arrayBuffer();
  const unzipped = unzipSync(new Uint8Array(arrayBuffer));

  // طرح‌واره‌ی جدیدتر anki21 ترجیح داده می‌شود.
  const colBytes = unzipped['collection.anki21'] || unzipped['collection.anki2'];
  if (!colBytes) {
    if (unzipped['collection.anki21b']) {
      throw new Error(
        'این فایل با فشرده‌سازی جدید Anki (anki21b/zstd) ساخته شده. لطفاً در Anki دسکتاپ هنگام Export گزینه‌ی «Support older Anki versions» را فعال کنید و دوباره خروجی بگیرید.',
      );
    }
    throw new Error('فایل apkg نامعتبر است: collection یافت نشد.');
  }

  const sdb = new SQLlib.Database(new Uint8Array(colBytes));

  const colRow = sdb.exec('SELECT data, decks, models, conf, tags FROM col LIMIT 1')[0]
    || sdb.exec('SELECT * FROM col LIMIT 1')[0];

  // طرح‌واره‌ی قدیمی ستون‌های جدا (decks/models/conf) دارد؛ جدیدتر همه را در data دارد.
  let collection;
  try {
    const cols = sdb.exec('SELECT decks, models, conf FROM col LIMIT 1')[0];
    if (cols) {
      const [decksJson, modelsJson, confJson] = cols.values[0];
      collection = {
        decks: JSON.parse(decksJson || '{}'),
        models: JSON.parse(modelsJson || '{}'),
        config: JSON.parse(confJson || '{}'),
        css: '',
      };
    }
  } catch {
    collection = null;
  }

  if (!collection) {
    const dataRow = sdb.exec('SELECT data FROM col LIMIT 1')[0];
    collection = parseCollectionData(dataRow?.values?.[0]?.[0]);
  }
  void colRow;

  const notesRes = sdb.exec('SELECT id, guid, mid, mod, flds, tags FROM notes')[0];
  const notes = (notesRes?.values || []).map((row) => ({
    id: row[0],
    guid: row[1],
    mid: row[2],
    modified: row[3],
    fields: String(row[4]).split('\x1f'),
    tags: String(row[5] || '').trim().split(/\s+/).filter(Boolean),
  }));

  const cardsRes = sdb.exec(
    'SELECT id, nid, did, ord, mod, type, queue, due, ivl, factor, reps, lapses FROM cards',
  )[0];
  const cards = (cardsRes?.values || []).map((row) => ({
    id: row[0], noteId: row[1], deckId: row[2], ord: row[3], modified: row[4],
    type: row[5], queue: row[6], due: row[7], interval: row[8],
    easeFactor: row[9], reps: row[10], lapses: row[11],
  }));

  sdb.close();

  // --- مدیا: فایل media یک JSON با نگاشت "0" → "filename" است ---
  const mediaFiles = {};
  const mediaMapBytes = unzipped['media'];
  if (mediaMapBytes) {
    let map = {};
    try {
      map = JSON.parse(strFromU8(mediaMapBytes));
    } catch {
      map = {};
    }
    for (const [num, name] of Object.entries(map)) {
      const data = unzipped[num];
      if (data) {
        mediaFiles[name] = new Blob([data], { type: mimeFor(name) });
      }
    }
  }

  return { collection, notes, cards, mediaFiles };
}
