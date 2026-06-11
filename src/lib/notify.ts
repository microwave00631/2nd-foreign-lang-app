// 夜間リマインダー(3層): ①アプリ内バナー ②フォアグラウンドタイマー ③Periodic Background Sync(SW側)
import { getSettings, saveSettings } from '../db/schema';
import { getQueueCounts } from './queue';
import { currentStreak } from './stats';
import { localDateKey, timeStringToTodayMs } from './time';

export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const res = await Notification.requestPermission();
  return res === 'granted';
}

export async function buildNotificationBody(): Promise<{ title: string; body: string; due: number } | null> {
  const settings = await getSettings();
  const now = Date.now();
  const counts = await getQueueCounts(settings.activeLang, now);
  if (counts.due + counts.freshNew === 0) return null;
  const streak = await currentStreak(now);
  return {
    title: '今日の復習の時間です',
    body: `復習 ${counts.due}語・新規 ${counts.freshNew}語が待っています🔥 連続${streak}日`,
    due: counts.due,
  };
}

async function showViaServiceWorker(title: string, body: string): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const base = import.meta.env.BASE_URL;
  await reg.showNotification(title, {
    body,
    icon: `${base}icons/icon-192.png`,
    badge: `${base}icons/icon-192.png`,
    tag: 'evening-review',
    data: { url: `${base}quiz` },
  });
  return true;
}

/** 設定画面の「テスト通知を送る」 */
export async function sendTestNotification(): Promise<boolean> {
  if (!(await requestPermission())) return false;
  const content = (await buildNotificationBody()) ?? {
    title: '今日の復習の時間です',
    body: 'テスト通知です。今日のキューは空です🎉',
  };
  return showViaServiceWorker(content.title, content.body);
}

/** バナー表示条件: 通知時刻を過ぎていて、今日のキューが残っている */
export async function shouldShowBanner(now: number): Promise<boolean> {
  const settings = await getSettings();
  if (now < timeStringToTodayMs(settings.notificationTime, now)) return false;
  const counts = await getQueueCounts(settings.activeLang, now);
  return counts.due + counts.freshNew > 0;
}

let timerId: number | null = null;

/** 60秒間隔のフォアグラウンドチェック。App マウント時に1回呼ぶ。 */
export function startForegroundTimer(): void {
  if (timerId !== null) return;
  const tick = async () => {
    try {
      const settings = await getSettings();
      if (!settings.notificationsEnabled) return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const now = Date.now();
      const today = localDateKey(now);
      if (settings.lastNotifiedDate === today) return;
      const start = timeStringToTodayMs(settings.notificationTime, now);
      if (now < start || now > start + 60 * 60_000) return; // 通知時刻から1時間以内のみ
      const content = await buildNotificationBody();
      if (!content) return;
      if (await showViaServiceWorker(content.title, content.body)) {
        await saveSettings({ lastNotifiedDate: today });
      }
    } catch {
      // 通知失敗は致命的でないため握りつぶす
    }
  };
  void tick();
  timerId = window.setInterval(tick, 60_000);
}

/** Periodic Background Sync の登録(Chrome・インストール済みPWAのみ成功する) */
export async function registerPeriodicSync(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) return false;
    const status = await navigator.permissions.query({
      name: 'periodic-background-sync' as PermissionName,
    });
    if (status.state !== 'granted') return false;
    await (reg as unknown as { periodicSync: { register(tag: string, opts: { minInterval: number }): Promise<void> } }).periodicSync.register(
      'evening-review',
      { minInterval: 12 * 60 * 60 * 1000 },
    );
    return true;
  } catch {
    return false;
  }
}
