import Dexie from 'dexie';

// ---------------------------------------------------------------------------
// IndexedDB schema — مدل‌سازی نزدیک به Anki اما بهینه برای مرورگر/موبایل.
// همه‌ی زمان‌ها به صورت عددی (میلی‌ثانیه از epoch) ذخیره می‌شوند تا مقایسه و
// محاسبه‌ی سررسید ساده و سریع باشد.
// ---------------------------------------------------------------------------
export const db = new Dexie('AnkiWebDB');

// نسخه‌ی اولیه (برای سازگاری با نصب‌های قدیمی نگه داشته شده).
db.version(1).stores({
  decks: '++id, name, parentId, createdAt, modifiedAt',
  notes: '++id, deckId, modelId, createdAt, modifiedAt, *tags',
  cards: '++id, noteId, deckId, due, state, queue, *tags',
  models: '++id, name',
  revlog: '++id, cardId, reviewedAt',
  media: '&name, blob',
  config: '&key, value',
});

// نسخه‌ی نهایی و فعال.
db.version(2)
  .stores({
    decks: '++id, name, parentId, modifiedAt',
    notes: '++id, deckId, modelId, modifiedAt, *tags',
    cards: '++id, noteId, deckId, due, state, queue',
    models: '&mid, name',
    revlog: '++id, cardId, reviewedAt',
    media: '&name',
    config: '&key',
  })
  .upgrade(async () => {
    // نصب‌های قدیمی داده‌ی واقعی نداشتند؛ نیازی به مهاجرت داده نیست.
  });

export default db;
