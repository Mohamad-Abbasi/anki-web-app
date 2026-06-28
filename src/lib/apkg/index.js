export { parseApkg } from './parser.js';
export { importParsedApkg } from './importer.js';
export { exportToApkg } from './exporter.js';

import { parseApkg } from './parser.js';
import { importParsedApkg } from './importer.js';

/** میان‌بر: یک فایل .apkg را پارس و مستقیماً وارد دیتابیس می‌کند. */
export async function importApkgFile(file) {
  const parsed = await parseApkg(file);
  const fallback = (file.name || 'Imported Deck').replace(/\.apkg$/i, '');
  return importParsedApkg(parsed, fallback);
}
