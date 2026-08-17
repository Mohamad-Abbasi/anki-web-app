import { describe, it, expect } from 'vitest';
import { dayNumber, currentDaily, ROLLOVER_HOUR } from './day.js';
import { buildDeckTree, flattenTree, collectDeckIds } from './deckTree.js';

const DAY = 86400000;
const HOUR = 3600000;

describe('day rollover', () => {
  it('treats times before 4am as the previous day', () => {
    const at3am = Date.UTC(2026, 0, 10, 3, 0, 0);
    const at5am = Date.UTC(2026, 0, 10, 5, 0, 0);
    expect(dayNumber(at3am)).toBe(dayNumber(at5am) - 1);
  });

  it('keeps the same day number across a normal afternoon', () => {
    const noon = Date.UTC(2026, 0, 10, 12, 0, 0);
    expect(dayNumber(noon)).toBe(dayNumber(noon + 6 * HOUR));
  });

  it('advances by one across 24 hours', () => {
    const t = Date.UTC(2026, 0, 10, 12, 0, 0);
    expect(dayNumber(t + DAY)).toBe(dayNumber(t) + 1);
  });

  it('uses a 4am rollover', () => {
    expect(ROLLOVER_HOUR).toBe(4);
  });
});

describe('currentDaily', () => {
  it('returns zeroed counters when the deck has none', () => {
    const d = currentDaily({});
    expect(d.newDone).toBe(0);
    expect(d.revDone).toBe(0);
    expect(d.day).toBe(dayNumber());
  });

  it('keeps counters recorded for today', () => {
    const today = dayNumber();
    const d = currentDaily({ daily: { day: today, newDone: 5, revDone: 7 } });
    expect(d.newDone).toBe(5);
    expect(d.revDone).toBe(7);
  });

  it('resets counters from a previous day', () => {
    const d = currentDaily({ daily: { day: dayNumber() - 1, newDone: 20, revDone: 99 } });
    expect(d.newDone).toBe(0);
    expect(d.revDone).toBe(0);
  });
});

describe('deck tree', () => {
  const decks = [
    { id: 1, name: 'English' },
    { id: 2, name: 'English::Book 1' },
    { id: 3, name: 'English::Book 2' },
    { id: 4, name: 'Math' },
  ];
  const counts = {
    1: { new: 1, learn: 0, review: 0 },
    2: { new: 2, learn: 1, review: 3 },
    3: { new: 4, learn: 0, review: 1 },
    4: { new: 5, learn: 5, review: 5 },
  };

  it('nests subdecks under their parent', () => {
    const tree = buildDeckTree(decks, counts);
    expect(tree.map((n) => n.title).sort()).toEqual(['English', 'Math']);
    const eng = tree.find((n) => n.title === 'English');
    expect(eng.children.map((c) => c.title)).toEqual(['Book 1', 'Book 2']);
  });

  it('rolls child counts up into the parent', () => {
    const tree = buildDeckTree(decks, counts);
    const eng = tree.find((n) => n.title === 'English');
    expect(eng.counts.new).toBe(1 + 2 + 4);
    expect(eng.counts.review).toBe(0 + 3 + 1);
  });

  it('creates virtual parents for orphan subdecks', () => {
    const tree = buildDeckTree([{ id: 9, name: 'Ghost::Child' }], { 9: { new: 3, learn: 0, review: 0 } });
    expect(tree[0].title).toBe('Ghost');
    expect(tree[0].deck).toBeNull();
    expect(tree[0].counts.new).toBe(3);
  });

  it('collectDeckIds gathers the node and its descendants', () => {
    const tree = buildDeckTree(decks, counts);
    const eng = tree.find((n) => n.title === 'English');
    expect(collectDeckIds(eng).sort()).toEqual([1, 2, 3]);
  });

  it('flattenTree hides children of collapsed nodes', () => {
    const tree = buildDeckTree(decks, counts);
    expect(flattenTree(tree, new Set())).toHaveLength(4);
    expect(flattenTree(tree, new Set(['English']))).toHaveLength(2);
  });
});
