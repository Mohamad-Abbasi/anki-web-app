import { zipSync, strToU8 } from 'fflate';
import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import db from '../database/db';
import { getDeck, getModel, getMedia } from '../database/models';

// نام فایل‌های مدیای ارجاع‌شده در فیلدهای نوت‌ها را جمع می‌کند.
function collectMediaNames(notes) {
  const names = new Set();
  const srcRe = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  const soundRe = /\[sound:([^\]]+)\]/g;
  for (const n of notes) {
    const text = (n.fields || []).join(' ');
    let m;
    while ((m = srcRe.exec(text))) {
      if (!/^(https?:|data:|blob:)/i.test(m[1])) names.add(decodeURIComponent(m[1]).split('/').pop());
    }
    while ((m = soundRe.exec(text))) names.add(m[1].split('/').pop());
  }
  return [...names];
}

let SQL = null;
async function getSQL() {
  if (!SQL) SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  return SQL;
}

// هش ساده برای ستون csum (تشخیص تکراری در Anki — برای import کفایت می‌کند).
function fieldChecksum(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const COL_SQL = `CREATE TABLE col (id INTEGER PRIMARY KEY, crt INTEGER, mod INTEGER, scm INTEGER, ver INTEGER, dty INTEGER, usn INTEGER, ls INTEGER, conf TEXT, models TEXT, decks TEXT, dconf TEXT, tags TEXT);`;
const NOTES_SQL = `CREATE TABLE notes (id INTEGER PRIMARY KEY, guid TEXT, mid INTEGER, mod INTEGER, usn INTEGER, tags TEXT, flds TEXT, sfld TEXT, csum INTEGER, flags INTEGER, data TEXT);`;
const CARDS_SQL = `CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER, ord INTEGER, mod INTEGER, usn INTEGER, type INTEGER, queue INTEGER, due INTEGER, ivl INTEGER, factor INTEGER, reps INTEGER, lapses INTEGER, left INTEGER, odue INTEGER, odid INTEGER, flags INTEGER, data TEXT);`;
const REVLOG_SQL = `CREATE TABLE revlog (id INTEGER PRIMARY KEY, cid INTEGER, usn INTEGER, ease INTEGER, ivl INTEGER, lastIvl INTEGER, factor INTEGER, time INTEGER, type INTEGER);`;
const GRAVES_SQL = `CREATE TABLE graves (usn INTEGER, oid INTEGER, type INTEGER);`;

function guid() {
  return Math.random().toString(36).slice(2, 12);
}

/**
 * خروجی‌گرفتن یک دک به فایل .apkg سازگار با Anki دسکتاپ/موبایل.
 * @param {number} deckId
 * @returns {Blob}
 */
export async function exportToApkg(deckId) {
  const SQLlib = await getSQL();
  const deck = await getDeck(deckId);
  if (!deck) throw new Error('دک یافت نشد.');

  const notes = await db.notes.where('deckId').equals(Number(deckId)).toArray();
  const cards = await db.cards.where('deckId').equals(Number(deckId)).toArray();

  const sdb = new SQLlib.Database();
  sdb.run(COL_SQL);
  sdb.run(NOTES_SQL);
  sdb.run(CARDS_SQL);
  sdb.run(REVLOG_SQL);
  sdb.run(GRAVES_SQL);

  const now = Date.now();
  const nowSec = Math.floor(now / 1000);
  const crt = nowSec - (nowSec % 86400);
  const ankiDeckId = 1000;

  // مدل‌های مورد نیاز این دک
  const modelIds = [...new Set(notes.map((n) => n.modelId))];
  const modelsJson = {};
  const midNum = new Map();
  let midCounter = 1700000000000;
  for (const mid of modelIds) {
    const m = await getModel(mid);
    const numericMid = midCounter++;
    midNum.set(mid, numericMid);
    modelsJson[numericMid] = {
      id: numericMid,
      name: m.name,
      type: m.type || 0,
      mod: nowSec,
      usn: -1,
      did: ankiDeckId,
      css: m.css || '',
      flds: (m.flds || []).map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: 'Arial', size: 20 })),
      tmpls: (m.tmpls || []).map((t, ord) => ({ name: t.name || `Card ${ord + 1}`, ord, qfmt: t.qfmt, afmt: t.afmt, bqfmt: '', bafmt: '', did: null })),
      sortf: 0,
      latexPre: '',
      latexPost: '',
      req: (m.tmpls || []).map((_, i) => [i, 'any', [0]]),
    };
  }

  const decksJson = {
    1: { id: 1, name: 'Default', mod: nowSec, usn: -1, collapsed: false, newToday: [0, 0], revToday: [0, 0], lrnToday: [0, 0], timeToday: [0, 0], conf: 1, desc: '', dyn: 0, extendNew: 10, extendRev: 50 },
    [ankiDeckId]: { id: ankiDeckId, name: deck.name, mod: nowSec, usn: -1, collapsed: false, newToday: [0, 0], revToday: [0, 0], lrnToday: [0, 0], timeToday: [0, 0], conf: 1, desc: '', dyn: 0, extendNew: 10, extendRev: 50 },
  };

  const dconfJson = {
    1: { id: 1, name: 'Default', mod: 0, usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true,
      new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20 },
      rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
      lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
      dyn: false },
  };

  const conf = { nextPos: 1, estTimes: true, activeDecks: [ankiDeckId], sortType: 'noteFld', timeLim: 0, sortBackwards: false, addToCur: true, curDeck: ankiDeckId, newSpread: 0, dueCounts: true, curModel: midCounter - 1, collapseTime: 1200 };

  sdb.run(
    'INSERT INTO col VALUES (1,?,?,?,11,0,0,0,?,?,?,?,?)',
    [crt, nowSec, now, JSON.stringify(conf), JSON.stringify(modelsJson), JSON.stringify(decksJson), JSON.stringify(dconfJson), '{}'],
  );

  const noteIdMap = new Map();
  let nid = now;
  for (const n of notes) {
    const id = nid++;
    noteIdMap.set(n.id, id);
    const flds = (n.fields || []).join('\x1f');
    sdb.run('INSERT INTO notes VALUES (?,?,?,?,-1,?,?,?,?,0,"")', [
      id, n.guid || guid(), midNum.get(n.modelId), nowSec,
      (n.tags || []).join(' '), flds, n.fields?.[0] || '', fieldChecksum(n.fields?.[0] || ''),
    ]);
  }

  let cid = now + 100000;
  for (const c of cards) {
    sdb.run('INSERT INTO cards VALUES (?,?,?,?,?,-1,?,?,?,?,?,?,?,0,0,0,0,"")', [
      cid++, noteIdMap.get(c.noteId), ankiDeckId, c.ord || 0, nowSec,
      c.state || 0, c.state || 0, Math.max(0, Math.round((c.due || now) / 1000)),
      Math.round(c.interval || 0), Math.round((c.easeFactor || 2.5) * 1000), c.reps || 0, c.lapses || 0,
    ]);
  }

  const bytes = sdb.export();
  sdb.close();

  // جمع‌آوری مدیای ارجاع‌شده و ساخت نگاشت شماره‌دار (فرمت apkg).
  const zipContent = { 'collection.anki2': new Uint8Array(bytes) };
  const mediaMap = {};
  let idx = 0;
  for (const name of collectMediaNames(notes)) {
    const rec = await getMedia(name);
    if (rec?.blob) {
      zipContent[String(idx)] = new Uint8Array(await rec.blob.arrayBuffer());
      mediaMap[String(idx)] = name;
      idx++;
    }
  }
  zipContent.media = strToU8(JSON.stringify(mediaMap));

  const zipped = zipSync(zipContent, { level: 0 });
  return new Blob([zipped], { type: 'application/octet-stream' });
}
