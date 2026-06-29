export { parseApkg } from './parser.js';
export { importParsedApkg } from './importer.js';
export { exportToApkg } from './exporter.js';

import { parseApkg } from './parser.js';
import { importParsedApkg } from './importer.js';

/** میان‌بر: یک فایل .apkg را پارس و مستقیماً وارد دیتابیس می‌کند. */
export async function importApkgFile(file, onProgress) {
  onProgress?.({ phase: 'parse' });
  const parsed = await parseApkg(file);
  onProgress?.({ phase: 'save' });
  const fallback = (file.name || 'Imported Deck').replace(/\.(apkg|colpkg|zip)$/i, '');
  return importParsedApkg(parsed, fallback, onProgress);
}
