import { useState, useEffect, useCallback } from 'react';
import { createNote, updateNote, getModel, getModels } from '../lib/database/models.js';

export default function CardEditor({ deckId, note, onClose }) {
  const [models, setModels] = useState([]);
  const [modelId, setModelId] = useState(note?.modelId || 'basic');
  const [model, setModel] = useState(null);
  const [fields, setFields] = useState(note?.fields || []);
  const [tags, setTags] = useState((note?.tags || []).join(' '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getModels().then((all) => {
      // مدل‌های داخلی همیشه در دسترس‌اند.
      setModels(all.length ? all : []);
    });
  }, []);

  useEffect(() => {
    getModel(modelId).then((m) => {
      setModel(m);
      if (!note) setFields(new Array(m.flds.length).fill(''));
    });
  }, [modelId, note]);

  const handleSave = useCallback(async () => {
    if (!fields.some((f) => f && f.trim())) {
      setError('حداقل یک فیلد را پر کن.');
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

  return (
    <div className="overlay" onClick={() => onClose(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{note ? 'ویرایش کارت' : 'کارت جدید'}</h3>

        {!note && (
          <div className="field">
            <label>نوع نوت</label>
            <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
              {(models.length ? models : [{ mid: 'basic', name: 'Basic' }, { mid: 'cloze', name: 'Cloze' }]).map((m) => (
                <option key={m.mid} value={m.mid}>{m.name}</option>
              ))}
            </select>
          </div>
        )}

        {(model?.flds || ['Front', 'Back']).map((fname, i) => (
          <div className="field" key={fname + i}>
            <label>{fname}</label>
            <textarea
              rows={fname.toLowerCase().includes('back') || i > 0 ? 3 : 2}
              value={fields[i] || ''}
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

        {model?.type === 1 && (
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
            برای cloze از قالب {'{{c1::پاسخ}}'} استفاده کن.
          </p>
        )}

        <div className="field">
          <label>برچسب‌ها (با فاصله)</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} dir="auto" />
        </div>

        {error && <p style={{ color: 'var(--again)', fontSize: '0.85rem' }}>{error}</p>}

        <div className="actions">
          <button className="btn primary block" onClick={handleSave} disabled={saving}>
            {saving ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
          <button className="btn ghost" onClick={() => onClose(false)}>بستن</button>
        </div>
      </div>
    </div>
  );
}
