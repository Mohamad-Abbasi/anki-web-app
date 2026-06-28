// src/lib/algorithms/sm2.js
// SM-2 (SuperMemo 2) — الگوریتم کلاسیک Anki برای حالت سازگاری.
// رتبه‌ها: 1=Again, 2=Hard, 3=Good, 4=Easy
import { Rating, State } from './fsrs';

export { Rating, State };

const MIN_EASE = 1.3;

// محاسبه‌ی فاصله و ease بعدی برای یک کارت در حالت مرور (review) با SM-2.
// خروجی: { interval (روز), easeFactor }
export function sm2Review(card, rating, opts = {}) {
  const interval = card.interval || 1;
  let ease = card.easeFactor || opts.startingEase || 2.5;
  const hardFactor = opts.hardFactor ?? 1.2;
  const easyBonus = opts.easyBonus ?? 1.3;

  if (rating === Rating.Again) {
    ease = Math.max(MIN_EASE, ease - 0.2);
    return { interval: 1, easeFactor: ease, lapsed: true };
  }

  if (rating === Rating.Hard) {
    ease = Math.max(MIN_EASE, ease - 0.15);
    return { interval: Math.max(1, Math.round(interval * hardFactor)), easeFactor: ease };
  }

  if (rating === Rating.Good) {
    return { interval: Math.max(1, Math.round(interval * ease)), easeFactor: ease };
  }

  // Easy
  ease = ease + 0.15;
  return { interval: Math.max(1, Math.round(interval * ease * easyBonus)), easeFactor: ease };
}

// فاصله‌ی فارغ‌التحصیلی هنگام خروج از مراحل یادگیری (روز).
export function sm2Graduate(rating, opts = {}) {
  const graduatingInterval = opts.graduatingInterval ?? 1;
  const easyInterval = opts.easyInterval ?? 4;
  return rating === Rating.Easy ? easyInterval : graduatingInterval;
}
