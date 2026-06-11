/// <reference lib="webworker" />
// Service Worker: precache + 夜間通知(Periodic Background Sync)+ 通知クリック
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { db, getSettings, saveSettings } from './db/schema';
import { localDateKey, timeStringToTodayMs, endOfLocalDay } from './lib/time';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

/**
 * SW内で期日件数を直接計算する(notify.ts はDOM前提のため使わない)。
 */
async function dueCountForToday(): Promise<number> {
  const settings = await getSettings();
  const now = Date.now();
  return db.words
    .where('dueAt')
    .between(1, endOfLocalDay(now), true, true)
    .filter((w) => w.lang === settings.activeLang)
    .count();
}

async function maybeNotify(): Promise<void> {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return;
  const now = Date.now();
  const today = localDateKey(now);
  if (settings.lastNotifiedDate === today) return;
  // Periodic Sync の発火タイミングは不定のため、通知時刻以降〜深夜0時前のみ許可
  if (now < timeStringToTodayMs(settings.notificationTime, now)) return;
  const due = await dueCountForToday();
  if (due === 0) return;
  // サブパス配信(GitHub Pages等)でも壊れないよう SW のスコープ基準で解決する
  const scope = self.registration.scope;
  await self.registration.showNotification('今日の復習の時間です', {
    body: `復習 ${due}語が待っています🔥 寝る前にサクッと片付けましょう`,
    icon: new URL('icons/icon-192.png', scope).href,
    badge: new URL('icons/icon-192.png', scope).href,
    tag: 'evening-review',
    data: { url: new URL('quiz', scope).href },
  });
  await saveSettings({ lastNotifiedDate: today });
}

self.addEventListener('periodicsync', (event) => {
  const e = event as ExtendableEvent & { tag: string };
  if (e.tag === 'evening-review') {
    e.waitUntil(maybeNotify());
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url: string = event.notification.data?.url ?? self.registration.scope;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await (client as WindowClient).navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
