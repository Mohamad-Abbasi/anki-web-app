// src/lib/scheduler/scheduler.js
// زمان‌بند یکپارچه — مراحل یادگیری (بر حسب دقیقه) مثل Anki + مرور با FSRS یا SM-2.
// همه‌ی سررسیدها (due) و lastReview به صورت میلی‌ثانیه عددی ذخیره می‌شوند.
import db from '../database/db';
import { updateCard, logReview, getDeck } from '../database/models';
import {
  Rating, State,
  DEFAULT_FSRS_PARAMS,
  forgettingCurve, nextInterval,
  initStability, initDifficulty, nextDifficulty,
  nextRecallStability, nextForgetStability,
} from '../algorithms/fsrs';
import { sm2Review, sm2Graduate } from '../algorithms/sm2';

const MIN = 60000;
const DAY = 86400000;

export const Queue = {
  New: 0, Learning: 1, Review: 2, DayLearning: 3, Suspended: -1, Buried: -2,
};

function deckConfig(deck) {
  const c = deck?.config || {};
  return {
    scheduler: deck?.scheduler || c.scheduler || 'fsrs',
    fsrsParams: c.fsrsParams || DEFAULT_FSRS_PARAMS,
    requestRetention: c.requestRetention ?? 0.9,
    maxInterval: c.maxInterval ?? 36500,
    learningSteps: c.learningSteps?.length ? c.learningSteps : [1, 10],
    relearningSteps: c.relearningSteps?.length ? c.relearningSteps : [10],
    graduatingInterval: c.graduatingInterval ?? 1,
    easyInterval: c.easyInterval ?? 4,
    startingEase: c.startingEase ?? 2.5,
  };
}

function hardLearningDelay(steps, step) {
  if (step === 0 && steps.length > 1) return (steps[0] + steps[1]) / 2;
  return steps[step] ?? steps[steps.length - 1] ?? 10;
}

/**
 * هسته‌ی محاسبه: وضعیت بعدی کارت را بدون ذخیره در دیتابیس برمی‌گرداند.
 * @returns {object} فیلدهای به‌روزشده‌ی کارت شامل due (ms) و interval (روز)
 */
export function computeNext(card, rating, deck, nowMs = Date.now()) {
  const cfg = deckConfig(deck);
  const w = cfg.fsrsParams;
  const state = card.state ?? State.New;
  const reps = (card.reps || 0) + 1;
  let stability = card.stability;
  let difficulty = card.difficulty;
  let ease = card.easeFactor || cfg.startingEase;
  let lapses = card.lapses || 0;
  const step = card.learningStep || 0;

  const base = { reps, lastReview: nowMs, easeFactor: ease, stability, difficulty, lapses };

  const learning = (newStep, delayMin, st = State.Learning) => ({
    ...base,
    state: st,
    queue: Queue.Learning,
    learningStep: newStep,
    interval: 0,
    due: Math.round(nowMs + delayMin * MIN),
    stability, difficulty,
  });

  const graduate = (gradeRating) => {
    let interval;
    if (cfg.scheduler === 'sm2') {
      interval = sm2Graduate(gradeRating, cfg);
    } else {
      stability = initStability(w, gradeRating);
      difficulty = initDifficulty(w, gradeRating);
      interval = nextInterval(stability, cfg.requestRetention, cfg.maxInterval);
    }
    return {
      ...base, stability, difficulty,
      state: State.Review, queue: Queue.Review,
      learningStep: 0, interval,
      due: Math.round(nowMs + interval * DAY),
    };
  };

  // --- New / Learning ---
  if (state === State.New || state === State.Learning) {
    if (cfg.scheduler === 'fsrs' && stability == null) {
      stability = initStability(w, rating);
      difficulty = initDifficulty(w, rating);
      base.stability = stability;
      base.difficulty = difficulty;
    }
    const steps = cfg.learningSteps;
    if (rating === Rating.Again) return learning(0, steps[0]);
    if (rating === Rating.Hard) return learning(step, hardLearningDelay(steps, step));
    if (rating === Rating.Good) {
      const next = step + 1;
      return next >= steps.length ? graduate(Rating.Good) : learning(next, steps[next]);
    }
    return graduate(Rating.Easy); // Easy
  }

  // --- Relearning ---
  if (state === State.Relearning) {
    const steps = cfg.relearningSteps;
    const graduateRelearn = (gradeRating) => {
      let interval;
      if (cfg.scheduler === 'sm2') {
        interval = Math.max(cfg.graduatingInterval, Math.round((card.interval || 1)));
        if (gradeRating === Rating.Easy) interval = Math.round(interval * 1.3);
      } else {
        interval = nextInterval(stability, cfg.requestRetention, cfg.maxInterval);
      }
      return {
        ...base, state: State.Review, queue: Queue.Review,
        learningStep: 0, interval, due: Math.round(nowMs + interval * DAY),
      };
    };
    if (rating === Rating.Again) return learning(0, steps[0], State.Relearning);
    if (rating === Rating.Hard) return learning(step, hardLearningDelay(steps, step), State.Relearning);
    if (rating === Rating.Good) {
      const next = step + 1;
      return next >= steps.length ? graduateRelearn(Rating.Good) : learning(next, steps[next], State.Relearning);
    }
    return graduateRelearn(Rating.Easy);
  }

  // --- Review ---
  const elapsedDays = Math.max(0, (nowMs - (card.lastReview || nowMs)) / DAY);

  if (cfg.scheduler === 'sm2') {
    const res = sm2Review(card, rating, cfg);
    ease = res.easeFactor;
    if (rating === Rating.Again) {
      lapses += 1;
      return {
        ...base, easeFactor: ease, lapses,
        state: State.Relearning, queue: Queue.Learning,
        learningStep: 0, interval: 1,
        due: Math.round(nowMs + cfg.relearningSteps[0] * MIN),
      };
    }
    return {
      ...base, easeFactor: ease,
      state: State.Review, queue: Queue.Review,
      interval: res.interval, due: Math.round(nowMs + res.interval * DAY),
    };
  }

  // FSRS review
  const r = forgettingCurve(elapsedDays, stability);
  difficulty = nextDifficulty(w, difficulty, rating);
  if (rating === Rating.Again) {
    stability = nextForgetStability(w, difficulty, stability, r);
    lapses += 1;
    return {
      ...base, stability, difficulty, lapses,
      state: State.Relearning, queue: Queue.Learning,
      learningStep: 0, interval: 0,
      due: Math.round(nowMs + cfg.relearningSteps[0] * MIN),
    };
  }
  stability = nextRecallStability(w, difficulty, stability, r, rating);
  const interval = nextInterval(stability, cfg.requestRetention, cfg.maxInterval);
  return {
    ...base, stability, difficulty,
    state: State.Review, queue: Queue.Review,
    interval, due: Math.round(nowMs + interval * DAY),
  };
}

function formatDelta(ms) {
  const min = ms / MIN;
  if (min < 1) return '<1m';
  if (min < 60) return `${Math.round(min)}m`;
  const hr = min / 60;
  if (hr < 24) return `${Math.round(hr)}h`;
  const d = hr / 24;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${(d / 30).toFixed(1)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

/** پیش‌نمایش فاصله‌ی هر چهار دکمه بدون تغییر دیتابیس. */
export function previewIntervals(card, deck, nowMs = Date.now()) {
  const out = {};
  for (const [name, rating] of Object.entries(Rating)) {
    const next = computeNext({ ...card }, rating, deck, nowMs);
    out[name.toLowerCase()] = formatDelta(next.due - nowMs);
  }
  return out; // { again, hard, good, easy }
}

/** نمره دادن به کارت: محاسبه، ذخیره و ثبت در لاگ مرور. */
export async function answerCard(card, rating, deck) {
  const nowMs = Date.now();
  const lastInterval = card.interval || 0;
  const updated = computeNext(card, rating, deck, nowMs);

  await updateCard(card.id, {
    ...updated,
    modifiedAt: nowMs,
  });

  await logReview({
    cardId: card.id,
    rating,
    state: updated.state,
    interval: updated.interval,
    lastInterval,
    ease: updated.easeFactor ?? updated.difficulty ?? 0,
    scheduler: deckConfig(deck).scheduler,
    reviewedAt: nowMs,
  });

  return { ...card, ...updated };
}

/**
 * ساخت صف مطالعه‌ی یک دک با رعایت محدودیت روزانه.
 * ترتیب: کارت‌های یادگیری سررسیده → کارت‌های جدید → مرورهای سررسیده.
 */
export async function buildStudyQueue(deckId) {
  const deck = await getDeck(deckId);
  const c = deck?.config || {};
  const newLimit = c.newPerDay ?? 20;
  const reviewLimit = c.reviewsPerDay ?? 200;
  const nowMs = Date.now();

  const all = await db.cards.where('deckId').equals(Number(deckId)).toArray();
  const active = all.filter((x) => x.queue !== Queue.Suspended && x.queue !== Queue.Buried);

  const learning = active
    .filter((x) => (x.state === State.Learning || x.state === State.Relearning) && (x.due ?? 0) <= nowMs)
    .sort((a, b) => (a.due ?? 0) - (b.due ?? 0));

  const newCards = active
    .filter((x) => x.state === State.New)
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    .slice(0, newLimit);

  const reviews = active
    .filter((x) => x.state === State.Review && (x.due ?? 0) <= nowMs)
    .sort((a, b) => (a.due ?? 0) - (b.due ?? 0))
    .slice(0, reviewLimit);

  return { queue: [...learning, ...newCards, ...reviews], deck };
}

export { State, Rating };
