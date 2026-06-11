// 統計・ストリークは reviews テーブルから導出する(専用テーブルなし)。
import { db, type Lang, type Stage } from '../db/schema';
import { DAY_MS, localDateKey, startOfLocalDay } from './time';

export interface DailyCount {
  dateKey: string;
  count: number;
}

/** 直近 n 日のレビュー数(古い日付→今日) */
export async function reviewsPerDay(n: number, now: number): Promise<DailyCount[]> {
  const since = startOfLocalDay(now) - (n - 1) * DAY_MS;
  const reviews = await db.reviews.where('at').aboveOrEqual(since).toArray();
  const map = new Map<string, number>();
  for (const r of reviews) {
    const k = localDateKey(r.at);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  const out: DailyCount[] = [];
  for (let i = 0; i < n; i++) {
    const k = localDateKey(since + i * DAY_MS);
    out.push({ dateKey: k, count: map.get(k) ?? 0 });
  }
  return out;
}

/** 連続学習日数: 今日(または昨日)から遡って途切れるまで */
export async function currentStreak(now: number): Promise<number> {
  const reviews = await db.reviews.orderBy('at').toArray();
  if (reviews.length === 0) return 0;
  const days = new Set(reviews.map((r) => localDateKey(r.at)));
  let cursor = startOfLocalDay(now);
  // 今日まだ学習していなければ昨日起点で数える
  if (!days.has(localDateKey(cursor))) cursor -= DAY_MS;
  let streak = 0;
  while (days.has(localDateKey(cursor))) {
    streak++;
    cursor -= DAY_MS;
  }
  return streak;
}

export async function stageDistribution(lang: Lang): Promise<Record<Stage, number>> {
  const out: Record<Stage, number> = { new: 0, learning: 0, review: 0, mastered: 0 };
  const words = await db.words.where('[lang+stage]').between([lang, ''], [lang, '￿']).toArray();
  for (const w of words) out[w.stage]++;
  return out;
}

export interface Totals {
  words: number;
  reviews: number;
  lookups: number;
}

export async function totals(lang: Lang): Promise<Totals> {
  const words = await db.words.where('[lang+headword]').between([lang, ''], [lang, '￿']).count();
  const lookups = await db.lookups.where('[lang+query]').between([lang, ''], [lang, '￿']).count();
  const wordIds = new Set(
    (await db.words.where('[lang+headword]').between([lang, ''], [lang, '￿']).toArray()).map((w) => w.id!),
  );
  const reviews = await db.reviews.filter((r) => wordIds.has(r.wordId)).count();
  return { words, reviews, lookups };
}
