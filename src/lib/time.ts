export const DAY_MS = 86_400_000;

/** ローカルタイムでのその日の 00:00 (epoch ms) */
export function startOfLocalDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfLocalDay(t: number): number {
  return startOfLocalDay(t) + DAY_MS - 1;
}

/** 'YYYY-MM-DD' (ローカル) */
export function localDateKey(t: number): string {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 'HH:mm' をその日のローカル epoch ms に変換 */
export function timeStringToTodayMs(hhmm: string, now: number): number {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}
