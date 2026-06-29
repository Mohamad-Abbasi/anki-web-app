// src/lib/render/sanitize.js
// پاک‌سازی HTML کارت‌ها برای جلوگیری از XSS (به‌ویژه دک‌های نامطمئن/مشترک).
// تگ‌های خطرناک و رویدادها و javascript: حذف می‌شوند.
const DANGEROUS = 'script,iframe,object,embed,link,meta,base,form';

export function sanitizeHtml(html) {
  if (!html) return '';
  let doc;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return '';
  }
  doc.querySelectorAll(DANGEROUS).forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const val = attr.value || '';
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      else if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(val)) {
        el.removeAttribute(attr.name);
      } else if (name === 'style' && /expression\s*\(|javascript:/i.test(val)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}
