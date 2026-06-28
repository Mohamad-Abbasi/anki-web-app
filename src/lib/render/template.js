// src/lib/render/template.js
// رندر قالب‌های کارت Anki: جایگزینی {{Field}}, {{FrontSide}}, شرط‌ها،
// فیلترها و cloze. خروجی HTML خام است (مدیا جداگانه resolve می‌شود).

function stripHtml(s) {
  return String(s).replace(/<[^>]*>/g, '');
}

function renderCloze(text, clozeNum, reveal) {
  return String(text).replace(/\{\{c(\d+)::([\s\S]*?)\}\}/g, (_, n, body) => {
    const parts = body.split('::');
    const answer = parts[0];
    const hint = parts.slice(1).join('::');
    if (Number(n) === clozeNum) {
      if (reveal) return `<span class="cloze">${answer}</span>`;
      return `<span class="cloze">[${hint || '...'}]</span>`;
    }
    return answer; // cloze های دیگر به‌صورت پاسخ نمایش داده می‌شوند
  });
}

function renderTemplate(tpl, fields, clozeOpts) {
  let out = String(tpl || '');

  // {{cloze:Field}}
  out = out.replace(/\{\{cloze:([^}]+)\}\}/g, (_, f) => {
    const v = fields[f.trim()] || '';
    return clozeOpts ? renderCloze(v, clozeOpts.clozeNum, clozeOpts.reveal) : v;
  });

  // شرط‌ها: {{#Field}}...{{/Field}} و {{^Field}}...{{/Field}}
  out = out.replace(/\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\s*\1\s*\}\}/g, (_, f, inner) =>
    fields[f.trim()] ? inner : '',
  );
  out = out.replace(/\{\{\^([^}]+)\}\}([\s\S]*?)\{\{\/\s*\1\s*\}\}/g, (_, f, inner) =>
    !fields[f.trim()] ? inner : '',
  );

  // فیلترها: {{text:Field}}, {{hint:Field}}, {{type:Field}}
  out = out.replace(/\{\{(text|hint|type):([^}]+)\}\}/g, (_, filt, f) => {
    const v = fields[f.trim()] || '';
    return filt === 'text' ? stripHtml(v) : v;
  });

  // فیلدهای ساده و {{FrontSide}}
  out = out.replace(/\{\{([^#/^][^}]*)\}\}/g, (_, f) => fields[f.trim()] ?? '');

  return out;
}

/**
 * رندر یک کارت به { question, answer, css }.
 * @param {object} note نوت دارای fields (آرایه)
 * @param {object} model مدل دارای flds/tmpls/type/css
 * @param {number} ord شماره‌ی قالب/کلوز
 */
export function renderCard(note, model, ord = 0) {
  const fields = {};
  (model.flds || []).forEach((name, i) => {
    fields[name] = note.fields?.[i] ?? '';
  });

  if (model.type === 1) {
    const num = (ord || 0) + 1;
    const tmpl = model.tmpls?.[0] || { qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}' };
    const question = renderTemplate(tmpl.qfmt, fields, { clozeNum: num, reveal: false });
    const answer = renderTemplate(tmpl.afmt, { ...fields, FrontSide: question }, { clozeNum: num, reveal: true });
    return { question, answer, css: model.css || '' };
  }

  const tmpl = model.tmpls?.[ord] || model.tmpls?.[0] || { qfmt: '{{Front}}', afmt: '{{Back}}' };
  const question = renderTemplate(tmpl.qfmt, fields);
  const answer = renderTemplate(tmpl.afmt, { ...fields, FrontSide: question });
  return { question, answer, css: model.css || '' };
}
