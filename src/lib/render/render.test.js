import { describe, it, expect } from 'vitest';
import { renderCard } from './template.js';
import { sanitizeHtml } from './sanitize.js';

const basic = {
  mid: 'basic', name: 'Basic', type: 0,
  flds: ['Front', 'Back'], css: '',
  tmpls: [{ name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id="answer">{{Back}}' }],
};

const reversed = {
  ...basic, type: 0,
  tmpls: [
    { qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr>{{Back}}' },
    { qfmt: '{{Back}}', afmt: '{{FrontSide}}<hr>{{Front}}' },
  ],
};

const cloze = {
  mid: 'cloze', name: 'Cloze', type: 1,
  flds: ['Text', 'Back Extra'], css: '',
  tmpls: [{ qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{Back Extra}}' }],
};

describe('template rendering', () => {
  it('renders basic front and back', () => {
    const r = renderCard({ fields: ['apple', 'سیب'] }, basic, 0);
    expect(r.question).toBe('apple');
    expect(r.answer).toContain('سیب');
  });

  it('substitutes FrontSide into the answer', () => {
    const r = renderCard({ fields: ['Q', 'A'] }, basic, 0);
    expect(r.answer.startsWith('Q')).toBe(true);
  });

  it('renders the reverse template for ord 1', () => {
    const r = renderCard({ fields: ['dog', 'سگ'] }, reversed, 1);
    expect(r.question).toBe('سگ');
    expect(r.answer).toContain('dog');
  });

  it('leaves missing fields empty rather than printing the tag', () => {
    const r = renderCard({ fields: ['only front'] }, basic, 0);
    expect(r.answer).not.toContain('{{');
  });

  it('supports conditional sections', () => {
    const model = { ...basic, tmpls: [{ qfmt: '{{#Back}}has{{/Back}}{{^Back}}none{{/Back}}', afmt: '' }] };
    expect(renderCard({ fields: ['f', 'b'] }, model, 0).question).toBe('has');
    expect(renderCard({ fields: ['f', ''] }, model, 0).question).toBe('none');
  });
});

describe('cloze', () => {
  it('hides the target cloze in the question and reveals it in the answer', () => {
    const note = { fields: ['Capital of France is {{c1::Paris}}.', ''] };
    const r = renderCard(note, cloze, 0);
    expect(r.question).toContain('[...]');
    expect(r.question).not.toContain('Paris');
    expect(r.answer).toContain('Paris');
  });

  it('shows the hint when provided', () => {
    const note = { fields: ['{{c1::Paris::city}} is nice', ''] };
    expect(renderCard(note, cloze, 0).question).toContain('[city]');
  });

  it('only hides the cloze matching the ordinal', () => {
    const note = { fields: ['Born in {{c1::1990}} in {{c2::Paris}}.', ''] };
    const card2 = renderCard(note, cloze, 1);
    expect(card2.question).toContain('1990');   // other cloze stays visible
    expect(card2.question).toContain('[...]');  // c2 hidden
    expect(card2.question).not.toContain('Paris');
  });
});

describe('sanitizeHtml', () => {
  it('strips script tags', () => {
    expect(sanitizeHtml('<p>ok</p><script>alert(1)</script>')).not.toContain('script');
  });

  it('strips inline event handlers', () => {
    const out = sanitizeHtml('<img src="x.png" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
    expect(out).toContain('src');
  });

  it('strips javascript: URLs', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
  });

  it('removes iframes but keeps safe markup', () => {
    const out = sanitizeHtml('<b>keep</b><iframe src="http://evil"></iframe>');
    expect(out).toContain('<b>keep</b>');
    expect(out).not.toContain('iframe');
  });

  it('keeps ordinary images and audio references intact', () => {
    const out = sanitizeHtml('<img src="pic.png"><audio src="a.mp3"></audio>');
    expect(out).toContain('pic.png');
    expect(out).toContain('a.mp3');
  });
});
