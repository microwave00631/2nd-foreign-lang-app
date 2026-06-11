import { useEffect, useState } from 'react';
import type { Stage } from '../db/schema';
import { currentStreak, reviewsPerDay, stageDistribution, totals, type DailyCount, type Totals } from '../lib/stats';
import { useSettings } from '../context/SettingsContext';

const STAGE_META: { key: Stage; label: string; color: string }[] = [
  { key: 'new', label: '未学習', color: '#9aa1b8' },
  { key: 'learning', label: '学習中', color: '#e8b450' },
  { key: 'review', label: '復習中', color: '#5b8def' },
  { key: 'mastered', label: '習得済み', color: '#4cc38a' },
];

export function StatsPage() {
  const { settings, loaded } = useSettings();
  const [streak, setStreak] = useState(0);
  const [dist, setDist] = useState<Record<Stage, number>>({ new: 0, learning: 0, review: 0, mastered: 0 });
  const [daily, setDaily] = useState<DailyCount[]>([]);
  const [tot, setTot] = useState<Totals>({ words: 0, reviews: 0, lookups: 0 });

  useEffect(() => {
    if (!loaded) return;
    const now = Date.now();
    currentStreak(now).then(setStreak);
    stageDistribution(settings.activeLang).then(setDist);
    reviewsPerDay(30, now).then(setDaily);
    totals(settings.activeLang).then(setTot);
  }, [loaded, settings.activeLang]);

  const distMax = Math.max(1, ...STAGE_META.map((s) => dist[s.key]));
  const dailyMax = Math.max(1, ...daily.map((d) => d.count));

  return (
    <div>
      <h1>統計</h1>
      <div className="counts-row">
        <div className="count-box">
          <div className="num">🔥{streak}</div>
          <div className="label">連続学習日数</div>
        </div>
        <div className="count-box">
          <div className="num">{tot.words}</div>
          <div className="label">学習中の単語</div>
        </div>
        <div className="count-box">
          <div className="num">{tot.reviews}</div>
          <div className="label">累計レビュー</div>
        </div>
      </div>

      <h2>学習段階の内訳</h2>
      <div className="card">
        {STAGE_META.map((s) => (
          <div key={s.key} className="bar-row">
            <span className="bar-label">{s.label}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(dist[s.key] / distMax) * 100}%`, background: s.color }} />
            </div>
            <span className="bar-num">{dist[s.key]}</span>
          </div>
        ))}
      </div>

      <h2>直近30日のレビュー数</h2>
      <div className="card">
        <div className="daily-chart">
          {daily.map((d) => (
            <div
              key={d.dateKey}
              className="day"
              style={{ height: `${(d.count / dailyMax) * 100}%`, opacity: d.count === 0 ? 0.15 : 1 }}
              title={`${d.dateKey}: ${d.count}件`}
            />
          ))}
        </div>
        <div className="muted" style={{ fontSize: '0.7rem', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span>{daily[0]?.dateKey}</span>
          <span>{daily[daily.length - 1]?.dateKey}</span>
        </div>
      </div>

      <p className="muted">翻訳検索の履歴: {tot.lookups}件</p>
    </div>
  );
}
