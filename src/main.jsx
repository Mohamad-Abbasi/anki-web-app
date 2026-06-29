import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { ensureBuiltinModels } from './lib/database/models.js';

// مدل‌های پیش‌فرض (Basic/Cloze) را در اولین اجرا تضمین کن.
ensureBuiltinModels();

// درخواست «حافظه‌ی ماندگار» تا مرورگر (به‌ویژه Safari آیفون) داده‌ها را
// خودبه‌خود پاک نکند. در حالت نصب‌شده‌ی PWA معمولاً پذیرفته می‌شود.
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// ثبت Service Worker برای کارکرد آفلاین و نصب روی صفحه‌ی اصلی آیفون.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
