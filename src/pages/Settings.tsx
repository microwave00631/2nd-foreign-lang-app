import { useState } from 'react';
import { db } from '../db/schema';
import { registerPeriodicSync, requestPermission, sendTestNotification } from '../lib/notify';
import { useSettings } from '../context/SettingsContext';

export function SettingsPage() {
  const { settings, update } = useSettings();
  const [testMsg, setTestMsg] = useState('');

  const toggleNotifications = async () => {
    if (!settings.notificationsEnabled) {
      const granted = await requestPermission();
      if (!granted) {
        setTestMsg('通知の許可が得られませんでした。ブラウザの設定を確認してください。');
        return;
      }
      await update({ notificationsEnabled: true });
      await registerPeriodicSync();
      setTestMsg('');
    } else {
      await update({ notificationsEnabled: false });
    }
  };

  const test = async () => {
    const ok = await sendTestNotification();
    setTestMsg(ok ? 'テスト通知を送信しました。' : '通知を送信できませんでした(権限・SW登録を確認)。');
  };

  const resetData = async () => {
    if (!window.confirm('学習データ(単語・履歴・統計)をすべて削除します。よろしいですか?')) return;
    await db.words.clear();
    await db.reviews.clear();
    await db.lookups.clear();
    setTestMsg('学習データをリセットしました。');
  };

  return (
    <div>
      <h1>設定</h1>

      <h2>夜のリマインダー</h2>
      <div className="setting-row">
        <div>
          <div className="s-label">通知を有効にする</div>
          <div className="s-hint">毎晩、未消化の復習があれば通知します</div>
        </div>
        <div
          className={`toggle ${settings.notificationsEnabled ? 'on' : ''}`}
          onClick={() => void toggleNotifications()}
        />
      </div>
      <div className="setting-row">
        <div className="s-label">通知時刻</div>
        <div className="s-control">
          <input
            type="time"
            value={settings.notificationTime}
            onChange={(e) => void update({ notificationTime: e.target.value })}
          />
        </div>
      </div>
      <div className="setting-row">
        <div>
          <div className="s-label">テスト通知</div>
          <div className="s-hint">通知が届くか確認できます</div>
        </div>
        <button className="btn-secondary" onClick={() => void test()}>
          テスト通知を送る
        </button>
      </div>
      {testMsg && <p className="muted">{testMsg}</p>}

      <h2>学習</h2>
      <div className="setting-row">
        <div>
          <div className="s-label">1日の新規単語数</div>
          <div className="s-hint">毎日辞書から自動投入する上限</div>
        </div>
        <div className="s-control">
          <input
            type="number"
            min={0}
            max={50}
            value={settings.dailyNewLimit}
            onChange={(e) => void update({ dailyNewLimit: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
      </div>
      <div className="setting-row">
        <div>
          <div className="s-label">声調まで厳格に判定</div>
          <div className="s-hint">中国語タイピングで声調の一致を要求</div>
        </div>
        <div
          className={`toggle ${settings.typingToneStrict ? 'on' : ''}`}
          onClick={() => void update({ typingToneStrict: !settings.typingToneStrict })}
        />
      </div>

      <h2>翻訳API</h2>
      <div className="setting-row">
        <div className="s-label">プロバイダ</div>
        <div className="s-control">
          <select
            value={settings.apiProvider}
            onChange={(e) => void update({ apiProvider: e.target.value as 'mymemory' | 'deepl' | 'none' })}
          >
            <option value="mymemory">MyMemory(無料・キー不要)</option>
            <option value="deepl">DeepL Free(中国語のみ)</option>
            <option value="none">使用しない</option>
          </select>
        </div>
      </div>
      {settings.apiProvider === 'deepl' && (
        <div className="setting-row">
          <div className="s-label">DeepL APIキー</div>
          <div className="s-control">
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => void update({ apiKey: e.target.value })}
              placeholder="xxxx-xxxx:fx"
            />
          </div>
        </div>
      )}
      {settings.apiProvider === 'mymemory' && (
        <div className="setting-row">
          <div>
            <div className="s-label">メールアドレス(任意)</div>
            <div className="s-hint">MyMemoryの1日あたり利用枠が増えます</div>
          </div>
          <div className="s-control">
            <input
              type="email"
              value={settings.apiEmail}
              onChange={(e) => void update({ apiEmail: e.target.value })}
              placeholder="you@example.com"
            />
          </div>
        </div>
      )}

      <h2>データ</h2>
      <div className="setting-row">
        <div>
          <div className="s-label">学習データのリセット</div>
          <div className="s-hint">単語・レビュー履歴・検索履歴を削除(辞書は残ります)</div>
        </div>
        <button className="btn-secondary" style={{ color: 'var(--red)' }} onClick={() => void resetData()}>
          リセット
        </button>
      </div>
    </div>
  );
}
