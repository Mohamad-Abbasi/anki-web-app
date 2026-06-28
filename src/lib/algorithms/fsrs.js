// src/lib/algorithms/fsrs.js
// FSRS (Free Spaced Repetition Scheduler) — همان موتوری که AnkiWeb برای
// زمان‌بندی مرورها استفاده می‌کند. پارامترهای پیش‌فرض FSRS-4.5/5.
// رتبه‌ها: 1=Again, 2=Hard, 3=Good, 4=Easy

export const DEFAULT_FSRS_PARAMS = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234,
  1.616, 0.1544, 1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407,
  2.9466, 0.5034, 0.6567,
];

const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // ≈ 19/81

export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };
export const State = { New: 0, Learning: 1, Review: 2, Relearning: 3 };

// میزان به‌یادآوری (retrievability) پس از t روز با پایداری s.
export function forgettingCurve(t, s) {
  return Math.pow(1 + (FACTOR * t) / s, DECAY);
}

// فاصله‌ی بعدی (روز) برای رسیدن به نرخ به‌یادآوری هدف، با توجه به پایداری.
export function nextInterval(stability, requestRetention = 0.9, maxInterval = 36500) {
  const interval = (stability / FACTOR) * (Math.pow(requestRetention, 1 / DECAY) - 1);
  return Math.min(Math.max(Math.round(interval), 1), maxInterval);
}

export function initStability(w, rating) {
  return Math.max(w[rating - 1], 0.1);
}

export function initDifficulty(w, rating) {
  return clampDifficulty(w[4] - Math.exp(w[5] * (rating - 1)) + 1);
}

function clampDifficulty(d) {
  return Math.min(Math.max(d, 1), 10);
}

export function nextDifficulty(w, d, rating) {
  const deltaD = -w[6] * (rating - 3);
  const dampened = d + deltaD * ((10 - d) / 9);
  const d0Easy = w[4] - Math.exp(w[5] * (Rating.Easy - 1)) + 1; // mean reversion
  return clampDifficulty(w[7] * d0Easy + (1 - w[7]) * dampened);
}

export function nextRecallStability(w, d, s, r, rating) {
  const hardPenalty = rating === Rating.Hard ? w[15] : 1;
  const easyBonus = rating === Rating.Easy ? w[16] : 1;
  return (
    s *
    (1 +
      Math.exp(w[8]) *
        (11 - d) *
        Math.pow(s, -w[9]) *
        (Math.exp((1 - r) * w[10]) - 1) *
        hardPenalty *
        easyBonus)
  );
}

export function nextForgetStability(w, d, s, r) {
  return (
    w[11] *
    Math.pow(d, -w[12]) *
    (Math.pow(s + 1, w[13]) - 1) *
    Math.exp((1 - r) * w[14])
  );
}
