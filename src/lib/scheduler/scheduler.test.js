import { describe, it, expect } from 'vitest';
import { computeNext, previewIntervals } from './scheduler.js';
import { State, Rating } from '../algorithms/fsrs.js';

const MIN = 60000;
const DAY = 86400000;
const NOW = 1_700_000_000_000;

const deck = (config = {}) => ({
  id: 1,
  scheduler: 'fsrs',
  config: {
    newPerDay: 20, reviewsPerDay: 200, requestRetention: 0.9, maxInterval: 36500,
    learningSteps: [1, 10], relearningSteps: [10], graduatingInterval: 1, easyInterval: 4,
    ...config,
  },
});

const newCard = (over = {}) => ({
  id: 1, deckId: 1, state: State.New, queue: 0, due: NOW,
  interval: 0, easeFactor: 2.5, stability: null, difficulty: null,
  learningStep: 0, reps: 0, lapses: 0, lastReview: null, ...over,
});

describe('learning steps', () => {
  it('Again on a new card returns to the first step (1 minute)', () => {
    const r = computeNext(newCard(), Rating.Again, deck(), NOW);
    expect(r.state).toBe(State.Learning);
    expect(r.learningStep).toBe(0);
    expect(Math.round((r.due - NOW) / MIN)).toBe(1);
  });

  it('Good advances to the next step (10 minutes), not graduating yet', () => {
    const r = computeNext(newCard(), Rating.Good, deck(), NOW);
    expect(r.state).toBe(State.Learning);
    expect(r.learningStep).toBe(1);
    expect(Math.round((r.due - NOW) / MIN)).toBe(10);
  });

  it('Good on the last step graduates to Review with a day-scale interval', () => {
    const card = newCard({ state: State.Learning, learningStep: 1, stability: 3, difficulty: 5 });
    const r = computeNext(card, Rating.Good, deck(), NOW);
    expect(r.state).toBe(State.Review);
    expect(r.interval).toBeGreaterThanOrEqual(1);
    expect(r.due - NOW).toBeGreaterThanOrEqual(DAY);
  });

  it('Easy graduates immediately from a new card', () => {
    const r = computeNext(newCard(), Rating.Easy, deck(), NOW);
    expect(r.state).toBe(State.Review);
    expect(r.interval).toBeGreaterThanOrEqual(1);
  });

  it('honours custom learning steps', () => {
    const r = computeNext(newCard(), Rating.Good, deck({ learningSteps: [5, 25, 120] }), NOW);
    expect(Math.round((r.due - NOW) / MIN)).toBe(25);
  });
});

describe('review scheduling (FSRS)', () => {
  const review = newCard({
    state: State.Review, interval: 10, stability: 10, difficulty: 5,
    reps: 3, lastReview: NOW - 10 * DAY,
  });

  it('Again lapses the card into relearning and increments lapses', () => {
    const r = computeNext(review, Rating.Again, deck(), NOW);
    expect(r.state).toBe(State.Relearning);
    expect(r.lapses).toBe(1);
    expect(Math.round((r.due - NOW) / MIN)).toBe(10); // first relearning step
  });

  it('Good keeps it in review and grows the interval', () => {
    const r = computeNext(review, Rating.Good, deck(), NOW);
    expect(r.state).toBe(State.Review);
    expect(r.interval).toBeGreaterThan(review.interval);
  });

  it('Easy yields a longer interval than Good', () => {
    const good = computeNext(review, Rating.Good, deck(), NOW);
    const easy = computeNext(review, Rating.Easy, deck(), NOW);
    expect(easy.interval).toBeGreaterThan(good.interval);
  });

  it('respects maxInterval', () => {
    const huge = { ...review, stability: 100000, interval: 9999 };
    const r = computeNext(huge, Rating.Easy, deck({ maxInterval: 365 }), NOW);
    expect(r.interval).toBeLessThanOrEqual(365);
  });

  it('increments reps on every answer', () => {
    expect(computeNext(review, Rating.Good, deck(), NOW).reps).toBe(review.reps + 1);
  });
});

describe('SM-2 mode', () => {
  const sm2Deck = { ...deck(), scheduler: 'sm2' };

  it('multiplies interval by ease on Good', () => {
    const card = newCard({ state: State.Review, interval: 10, easeFactor: 2.5, reps: 2 });
    const r = computeNext(card, Rating.Good, sm2Deck, NOW);
    expect(r.interval).toBe(25);
  });

  it('lowers ease and relearns on Again', () => {
    const card = newCard({ state: State.Review, interval: 10, easeFactor: 2.5 });
    const r = computeNext(card, Rating.Again, sm2Deck, NOW);
    expect(r.state).toBe(State.Relearning);
    expect(r.easeFactor).toBeLessThan(2.5);
  });

  it('never drops ease below 1.3', () => {
    let card = newCard({ state: State.Review, interval: 5, easeFactor: 1.35 });
    for (let i = 0; i < 5; i++) {
      const r = computeNext(card, Rating.Again, sm2Deck, NOW);
      card = { ...card, ...r, state: State.Review };
    }
    expect(card.easeFactor).toBeGreaterThanOrEqual(1.3);
  });
});

describe('previewIntervals', () => {
  it('returns a human label for all four buttons, increasing in length', () => {
    const p = previewIntervals(newCard(), deck(), NOW);
    expect(Object.keys(p).sort()).toEqual(['again', 'easy', 'good', 'hard']);
    for (const v of Object.values(p)) expect(typeof v).toBe('string');
    expect(p.again).toMatch(/m$/);
    expect(p.easy).toMatch(/[dmoy]$/);
  });
});
