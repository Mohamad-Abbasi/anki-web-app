// src/lib/render/media.js
// تبدیل ارجاع‌های مدیا در HTML کارت به Object URL از IndexedDB.
// کش به‌صورت LRU محدود است و آدرس‌های قدیمی revoke می‌شوند تا حافظه نشت نکند.
import { getMedia } from '../database/models';
import { SUPABASE_URL, cloudEnabled } from '../supabase/config';

// آدرس عمومی مدیا در Storage (برای دک‌های مشترکی که مدیایشان محلی نیست).
function publicMediaUrl(name) {
  if (!cloudEnabled) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/media/${encodeURIComponent(name)}`;
}

const MAX_CACHE = 150;
const urlCache = new Map(); // filename → objectURL (ترتیب درج = LRU)

function touch(key, url) {
  urlCache.delete(key);
  urlCache.set(key, url);
  while (urlCache.size > MAX_CACHE) {
    const oldest = urlCache.keys().next().value;
    const u = urlCache.get(oldest);
    urlCache.delete(oldest);
    try { URL.revokeObjectURL(u); } catch { /* ignore */ }
  }
}

export function clearMediaCache() {
  for (const u of urlCache.values()) {
    try { URL.revokeObjectURL(u); } catch { /* ignore */ }
  }
  urlCache.clear();
}

export async function mediaUrl(name) {
  const key = name.split('/').pop();
  if (urlCache.has(key)) {
    const u = urlCache.get(key);
    touch(key, u);
    return u;
  }
  const rec = await getMedia(key);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  touch(key, url);
  return url;
}

const SRC_RE = /(src|href)\s*=\s*["']([^"']+)["']/gi;
const SOUND_RE = /\[sound:([^\]]+)\]/g;
const EXTERNAL = /^(https?:|data:|blob:|#)/i;

/** ارجاع‌های مدیای محلی را با blob URL جایگزین و [sound:x] را به <audio> تبدیل می‌کند. */
export async function resolveMedia(html) {
  if (!html) return html;
  const names = new Set();
  let m;

  SRC_RE.lastIndex = 0;
  while ((m = SRC_RE.exec(html))) {
    if (!EXTERNAL.test(m[2])) names.add(decodeURIComponent(m[2]));
  }
  SOUND_RE.lastIndex = 0;
  while ((m = SOUND_RE.exec(html))) names.add(m[1]);

  const map = {};
  await Promise.all(
    [...names].map(async (n) => {
      const u = (await mediaUrl(n)) || publicMediaUrl(n.split('/').pop());
      if (u) map[n] = u;
    }),
  );

  let out = html.replace(SOUND_RE, (_, n) => {
    const u = map[n];
    return u ? `<audio controls preload="none" class="card-audio" src="${u}" style="max-width:100%"></audio>` : '';
  });

  out = out.replace(SRC_RE, (full, attr, v) => {
    if (EXTERNAL.test(v)) return full;
    const u = map[decodeURIComponent(v)];
    return u ? `${attr}="${u}"` : full;
  });

  return out;
}
