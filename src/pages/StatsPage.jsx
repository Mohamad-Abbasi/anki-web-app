import { useState, useEffect } from 'react';
import db from '../lib/database/db.js';
import { getRevlog } from '../lib/database/models.js';
import { State } from '../lib/algorithms/fsrs.js';

const DAY = 86400000;

export default function StatsPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const cards = await db.cards.toArray();
      const revlog = await getRevlog(20000);
      const now = Date.now();
      const todayStart = new Date().setHours(0, 0, 0, 0);

      const mature = cards.filter((c) => c.state === State.Review && (c.interval || 0) >= 21).length;
      const young = cards.filter((c) => c.state === State.Review && (c.interval || 0) < 21).length;
      const learning = cards.filter((c) => c.state === State.Learning || c.state === State.Relearning).length;
      const newCount = cards.filter((c) => c.state === State.New).length;

      const todayReviews = revlog.filter((r) => r.reviewedAt >= todayStart);
      const todayCorrect = todayReviews.filter((r) => r.rating >= 3).length;
      const retention = todayReviews.length ? Math.round((todayCorrect / todayReviews.length) * 100) : 0;

      // مرورها در ۱۴ روز اخیر
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const start = todayStart - i * DAY;
        const end = start + DAY;
        days.push(revlog.filter((r) => r.reviewedAt >= start && r.reviewedAt < end).length);
      }

      // پیش‌بینی سررسید ۱۴ روز آینده (کارت‌های مرور).
      const forecast = [];
      for (let i = 0; i < 14; i++) {
        const start = todayStart + i * DAY;
        const end = start + DAY;
        const count = cards.filter((c) => {
          if (c.state !== State.Review) return false;
          const due = c.due ?? 0;
          return i === 0 ? due < end : due >= start && due < end;
        }).length;
        forecast.push(count);
      }

      void now;
      setData({ total: cards.length, mature, young, learning, newCount, todayCount: todayReviews.length, retention, days, forecast });
    })();
  }, []);

  if (!data) return <div className="spinner" />;
  const max = Math.max(1, ...data.days);
  const fmax = Math.max(1, ...data.forecast);

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>آمار</h2>

      <div className="stat-grid">
        <div className="stat"><div className="num">{data.total}</div><div className="cap">کل کارت‌ها</div></div>
        <div className="stat"><div className="num">{data.todayCount}</div><div className="cap">مرور امروز</div></div>
        <div className="stat"><div className="num">{data.retention}%</div><div className="cap">دقت امروز</div></div>
        <div className="stat"><div className="num">{data.mature}</div><div className="cap">کارت بالغ (≥۲۱ روز)</div></div>
      </div>

      <div className="card-box">
        <h3 style={{ marginBottom: 12 }}>مرورها — ۱۴ روز اخیر</h3>
        <div className="bars">
          {data.days.map((v, i) => (
            <div key={i} className="bar" style={{ height: `${(v / max) * 100}%` }} title={`${v} مرور`} />
          ))}
        </div>
      </div>

      <div className="card-box">
        <h3 style={{ marginBottom: 12 }}>پیش‌بینی سررسید — ۱۴ روز آینده / Forecast</h3>
        <div className="bars">
          {data.forecast.map((v, i) => (
            <div key={i} className="bar" style={{ height: `${(v / fmax) * 100}%`, background: 'var(--hard)' }} title={`${v} کارت`} />
          ))}
        </div>
      </div>

      <div className="card-box">
        <h3 style={{ marginBottom: 12 }}>ترکیب کارت‌ها</h3>
        <div className="counts">
          <span className="pill new">جدید {data.newCount}</span>
          <span className="pill learn">یادگیری {data.learning}</span>
          <span className="pill review">جوان {data.young}</span>
          <span className="pill review">بالغ {data.mature}</span>
        </div>
      </div>
    </div>
  );
}
