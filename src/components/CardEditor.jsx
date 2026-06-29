import { useState, useEffect, useCallback, useRef } from 'react';
import { createNote, updateNote, getModel, getModels, saveMedia } from '../lib/database/models.js';

// توضیح فارسی برای نام فیلدهای استاندارد (انگلیسی هم نگه داشته می‌شود).
const FIELD_HINTS = {
  Front: 'رو — سؤال/جلوی کارت',
  Back: 'پشت — پاسخ/پشت کارت',
  Text: 'متن — جای‌خالی را با ‎{{c1::پاسخ}}‎ بساز',
  'Back Extra': 'توضیح اضافه — فقط در پاسخ دیده می‌شود',
};

function uniqueName(name) {
  const clean = (name || 'file').replace(/[^\w.-]+/g, '_');
  return `${Date.now()}_${clean}`;
}

export default function CardEditor({ deckId, note, onClose }) {
  const [models, setModels] = useState([]);
  const [modelId, setModelId] = useState(note?.modelId || 'basic');
  const [model, setModel] = useState(null);
  const [fields, setFields] = useState(note?.fields || []);
  const [tags, setTags] = useState((note?.tags || []).join(' '));
  const [activeField, setActiveField] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const imgInputRef = useRef(null);
  const audioInputRef = useRef(null);

  useEffect(() => {
    getModels().then((all) => setModels(all));
  }, []);

  useEffect(() => {
    getModel(modelId).then((m) => {
      setModel(m);
      if (!note) setFields(new Array(m.flds.length).fill(''));
    });
  }, [modelId, note]);

  const insertIntoActive = useCallback((snippet) => {
    setFields((prev) => {
      const next = [...prev];
      const idx = Math.min(activeField, (model?.flds?.length || 1) - 1);
      next[idx] = (next[idx] || '') + snippet;
      return next;
    });
  }, [activeField, model]);

  const handleUpload = useCallback(async (e, kind) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const name = uniqueName(file.name);
      await saveMedia(name, file);
      insertIntoActive(kind === 'image' ? `<img src="${name}">` : `[sound:${name}]`);
    } catch (err) {
      setError('آپلود ناموفق بود: ' + err.message);
    }
  }, [insertIntoActive]);

  const handleSave = useCallback(async () => {
    if (!fields.some((f) => f && f.trim())) {
      setError('حداقل یک فیلد را پر کن. / Fill at least one field.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tagList = tags.split(/\s+/).filter(Boolean);
      if (note?.id) {
        await updateNote(note.id, { fields, tags: tagList });
      } else {
        await createNote({ deckId, modelId, fields, tags: tagList });
      }
      onClose(true);
    } catch (err) {
      setError(err.message || 'ذخیره ناموفق بود');
    } finally {
      setSaving(false);
    }
  }, [fields, tags, note, deckId, modelId, onClose]);

  const fieldNames = model?.flds || ['Front', 'Back'];

  return (
    <div className="overlay" onClick={() => onClose(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{note ? 'ویرایش کارت / Edit Card' : 'کارت جدید / New Card'}</h3>

        {!note && (
          <div className="field">
            <label>نوع نوت / Note type</label>
            <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
              {(models.length ? models : [{ mid: 'basic', name: 'Basic' }, { mid: 'cloze', name: 'Cloze' }]).map((m) => (
                <option key={m.mid} value={m.mid}>{m.name}</option>
              ))}
            </select>
          </div>
        )}

        {fieldNames.map((fname, i) => (
          <div className="field" key={fname + i}>
            <label>
              {fname}
              {FIELD_HINTS[fname] && <span className="lbl-hint"> — {FIELD_HINTS[fname]}</span>}
            </label>
            <textarea
              rows={i === 0 ? 2 : 3}
              value={fields[i] || ''}
              onFocus={() => setActiveField(i)}
              onChange={(e) => {
                const next = [...fields];
                next[i] = e.target.value;
                setFields(next);
              }}
              dir="auto"
              autoFocus={i === 0}
            />
          </div>
        ))}

        {/* ابزار درج رسانه در فیلد فعال */}
        <div className="row" style={{ marginBottom: 10 }}>
          <button type="button" className="btn" onClick={() => imgInputRef.current?.click()}>🖼 تصویر / Image</button>
          <button type="button" className="btn" onClick={() => audioInputRef.current?.click()}>🔊 صدا / Audio</button>
        </div>
        <input ref={imgInputRef} type="file" accept="image/*" onChange={(e) => handleUpload(e, 'image')} style={{ display: 'none' }} />
        <input ref={audioInputRef} type="file" accept="audio/*" onChange={(e) => handleUpload(e, 'audio')} style={{ display: 'none' }} />

        <p className="lbl-hint" style={{ display: 'block', marginBottom: 12 }}>
          می‌توانی HTML ساده مثل {'<b>پررنگ</b>'} هم بنویسی. رسانه در فیلدی که آخرین‌بار کلیک کردی درج می‌شود.
        </p>

        {model?.type === 1 && (
          <p className="lbl-hint" style={{ display: 'block', marginBottom: 12 }}>
            Cloze: برای هر جای‌خالی از {'{{c1::پاسخ}}'} یا با راهنما {'{{c1::پاسخ::راهنما}}'} استفاده کن. شماره‌های متفاوت = کارت‌های جدا.
          </p>
        )}

        <div className="field">
          <label>برچسب‌ها / Tags (با فاصله)</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} dir="auto" />
        </div>

        {error && <p style={{ color: 'var(--again)', fontSize: '0.85rem' }}>{error}</p>}

        <div className="actions">
          <button className="btn primary block" onClick={handleSave} disabled={saving}>
            {saving ? 'در حال ذخیره...' : 'ذخیره / Save'}
          </button>
          <button className="btn ghost" onClick={() => onClose(false)}>بستن / Close</button>
        </div>
      </div>
    </div>
  );
}
