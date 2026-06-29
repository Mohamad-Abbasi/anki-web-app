// src/lib/backup.js
// پشتیبان‌گیری/بازیابی کاملِ همه‌ی داده‌ها (دک‌ها، نوت‌ها، کارت‌ها، سوابق مرور،
// مدل‌ها، تنظیمات و مدیا) به یک فایل .zip — برای جابه‌جایی بین مرورگرها/دستگاه‌ها
// و جلوگیری از نابودی داده هنگام پاک‌شدن مرورگر.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import db from './database/db';

const BACKUP_VERSION = 1;

export async function exportBackup() {
  const [decks, notes, cards, revlog, models, config] = await Promise.all([
    db.decks.toArray(),
    db.notes.toArray(),
    db.cards.toArray(),
    db.revlog.toArray(),
    db.models.toArray(),
    db.config.toArray(),
  ]);

  const data = { version: BACKUP_VERSION, exportedAt: Date.now(), decks, notes, cards, revlog, models, config };
  const files = { 'data.json': strToU8(JSON.stringify(data)) };

  const media = await db.media.toArray();
  for (const m of media) {
    files[`media/${m.name}`] = new Uint8Array(await m.blob.arrayBuffer());
  }

  // مدیا (mp3/jpg) از قبل فشرده است؛ سطح ۰ سریع‌تر و سبک‌تر است.
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped], { type: 'application/zip' });
}

export async function importBackup(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const unz = unzipSync(buf);
  if (!unz['data.json']) throw new Error('فایل پشتیبان نامعتبر است / Invalid backup file');
  const data = JSON.parse(strFromU8(unz['data.json']));

  await db.transaction('rw', db.decks, db.notes, db.cards, db.revlog, db.models, db.config, db.media, async () => {
    await Promise.all([
      db.decks.clear(), db.notes.clear(), db.cards.clear(),
      db.revlog.clear(), db.models.clear(), db.config.clear(), db.media.clear(),
    ]);
    if (data.decks?.length) await db.decks.bulkPut(data.decks);
    if (data.notes?.length) await db.notes.bulkPut(data.notes);
    if (data.cards?.length) await db.cards.bulkPut(data.cards);
    if (data.revlog?.length) await db.revlog.bulkPut(data.revlog);
    if (data.models?.length) await db.models.bulkPut(data.models);
    if (data.config?.length) await db.config.bulkPut(data.config);

    const mediaRows = [];
    for (const [path, bytes] of Object.entries(unz)) {
      if (path.startsWith('media/') && path.length > 6) {
        mediaRows.push({ name: path.slice(6), blob: new Blob([bytes]) });
      }
    }
    for (let i = 0; i < mediaRows.length; i += 1000) {
      await db.media.bulkPut(mediaRows.slice(i, i + 1000));
    }
  });

  return { decks: data.decks?.length || 0, notes: data.notes?.length || 0, cards: data.cards?.length || 0 };
}
