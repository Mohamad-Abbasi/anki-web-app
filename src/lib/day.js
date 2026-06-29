// src/lib/day.js
// شماره‌ی روز با «rollover» ساعت ۴ صبح (مثل Anki) — مبنای محدودیت‌های روزانه.
export const DAY_MS = 86400000;
export const ROLLOVER_HOUR = 4;

export function dayNumber(ms = Date.now()) {
  return Math.floor((ms - ROLLOVER_HOUR * 3600000) / DAY_MS);
}

// شمارنده‌ی روزانه‌ی دک را برای «امروز» برمی‌گرداند (در صورت تغییر روز، صفر می‌شود).
export function currentDaily(deck) {
  const day = dayNumber();
  const d = deck?.daily;
  return d && d.day === day ? { ...d } : { day, newDone: 0, revDone: 0 };
}
