import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Lang } from '../db/schema';
import { getQueueCounts, type QueueCounts } from '../lib/queue';
import { currentStreak } from '../lib/stats';
import { shouldShowBanner } from '../lib/notify';
import { useSettings } from '../context/SettingsContext';

const LANG_LABEL: Record<Lang, string> = { zh: '🇨🇳 中国語', th: '🇹🇭 タイ語' };

export function HomePage() {
  const { settings, update, loaded } = useSettings();
  const [counts, setCounts] = useState<QueueCounts>({ due: 0, freshNew: 0 });
  const [streak, setStreak] = useState(0);
  const [banner, setBanner] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    const now = Date.now();
    getQueueCounts(settings.activeLang, now).then(setCounts);
    currentStreak(now).then(setStreak);
    shouldShowBanner(now).then(setBanner);
  }, [loaded, settings.activeLang]);

  return (
    <div>
      <h1>語彙トレ</h1>
      <div className="lang-switch">
        {(['zh', 'th'] as Lang[]).map((l) => (
          <button
            key={l}
            className={settings.activeLang === l ? 'active' : ''}
            onClick={() => void update({ activeLang: l })}
          >
            {LANG_LABEL[l]}
          </button>
        ))}
      </div>

      {banner && (
        <div className="notify-banner">
          🌙 今日の復習がまだ残っています。寝る前にサクッと片付けましょう!
        </div>
      )}

      {streak > 0 && (
        <div className="streak-banner">
          <span style={{ fontSize: '1.5rem' }}>🔥</span> 連続 {streak} 日学習中
        </div>
      )}

      <div className="counts-row">
        <div className="count-box due">
          <div className="num">{counts.due}</div>
          <div className="label">復習する単語</div>
        </div>
        <div className="count-box new">
          <div className="num">{counts.freshNew}</div>
          <div className="label">今日の新規単語</div>
        </div>
      </div>

      <Link to="/quiz">
        <button className="btn-primary" disabled={counts.due + counts.freshNew === 0}>
          {counts.due + counts.freshNew === 0 ? '今日の学習は完了 🎉' : 'クイズを始める'}
        </button>
      </Link>

      <h2>つかいかた</h2>
      <div className="card muted" style={{ fontSize: '0.85rem', lineHeight: 1.7 }}>
        毎日のクイズで単語を学ぶと、間隔反復(SRS)が次の復習日を自動で決めます。
        知らない単語は「翻訳・検索」で調べて学習リストに追加。
        設定で夜のリマインダー通知を有効にすると、復習を忘れません。
      </div>
    </div>
  );
}
