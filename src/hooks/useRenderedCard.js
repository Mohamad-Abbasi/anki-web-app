import { useState, useEffect } from 'react';
import { getNote, getModel } from '../lib/database/models.js';
import { renderCard } from '../lib/render/template.js';
import { resolveMedia } from '../lib/render/media.js';
import { sanitizeHtml } from '../lib/render/sanitize.js';

// یک کارت را به HTML آماده‌ی نمایش (سؤال/پاسخ) با مدیای حل‌شده تبدیل می‌کند.
export function useRenderedCard(card) {
  const [content, setContent] = useState({ question: '', answer: '', css: '', loading: true });

  useEffect(() => {
    let alive = true;
    if (!card) {
      setContent({ question: '', answer: '', css: '', loading: false });
      return;
    }
    (async () => {
      setContent((c) => ({ ...c, loading: true }));
      const note = await getNote(card.noteId);
      if (!note) {
        if (alive) setContent({ question: '(نوت یافت نشد)', answer: '', css: '', loading: false });
        return;
      }
      const model = await getModel(note.modelId);
      const { question, answer, css } = renderCard(note, model, card.ord || 0);
      // اول پاک‌سازی (حذف اسکریپت/رویداد)، بعد جایگزینی مدیا با blob URL.
      const [q, a] = await Promise.all([
        resolveMedia(sanitizeHtml(question)),
        resolveMedia(sanitizeHtml(answer)),
      ]);
      if (alive) setContent({ question: q, answer: a, css, loading: false });
    })();
    return () => {
      alive = false;
    };
  }, [card]);

  return content;
}
