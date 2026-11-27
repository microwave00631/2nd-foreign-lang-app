// 検定クイズ(ロシア語能力検定 4〜2級レベル)の出題ロジック。
// 間違えた問題 → 未出題 → 正解済み(古い順)の優先度で 1 セッションを組む。
// 2回連続で正解した問題は「習得」とみなし、後回しにする。
import type { KenteiLevel, KenteiQuestion } from '../data/kenteiRu';

export interface KenteiRecord {
  id: string;
  level: KenteiLevel;
  seen: number;
  correct: number;
  wrong: number;
  /** 連続正解数(間違えると 0) */
  streak: number;
  lastAt: number;
}

export const MASTERED_STREAK = 2;
export const SESSION_SIZE = 10;

export type LevelFilter = KenteiLevel | 'all' | 'wrong';

export interface SessionQuestion extends KenteiQuestion {
  /** 表示順に並べ替えた選択肢と、その中での正解位置 */
  shuffled: string[];
  shuffledAnswer: number;
}

export function shuffle<T>(arr: T[], rand = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 0: 復習が必要(間違えた・まだ習得していない) / 1: 未出題 / 2: 習得済み */
export function bucketOf(rec?: KenteiRecord): 0 | 1 | 2 {
  if (!rec || rec.seen === 0) return 1;
  if (rec.streak >= MASTERED_STREAK) return 2;
  return 0;
}

export function isMastered(rec?: KenteiRecord) {
  return bucketOf(rec) === 2;
}

export function buildSession(
  bank: KenteiQuestion[],
  records: Map<string, KenteiRecord>,
  filter: LevelFilter,
  size = SESSION_SIZE,
  rand = Math.random,
): SessionQuestion[] {
  let pool = bank;
  if (filter === 'wrong') pool = bank.filter((q) => bucketOf(records.get(q.id)) === 0);
  else if (filter !== 'all') pool = bank.filter((q) => q.level === filter);

  const buckets: KenteiQuestion[][] = [[], [], []];
  for (const q of pool) buckets[bucketOf(records.get(q.id))].push(q);
  // 習得済みは最後に解いたのが古い順(同じ時刻ならランダム)
  const mastered = shuffle(buckets[2], rand).sort(
    (a, b) => (records.get(a.id)?.lastAt ?? 0) - (records.get(b.id)?.lastAt ?? 0),
  );
  const ordered = [...shuffle(buckets[0], rand), ...shuffle(buckets[1], rand), ...mastered];

  return shuffle(ordered.slice(0, size), rand).map((q) => {
    const order = shuffle(
      q.options.map((_, i) => i),
      rand,
    );
    return { ...q, shuffled: order.map((i) => q.options[i]), shuffledAnswer: order.indexOf(q.answer) };
  });
}

export function nextRecord(prev: KenteiRecord | undefined, q: KenteiQuestion, ok: boolean, now: number): KenteiRecord {
  const base: KenteiRecord = prev ?? { id: q.id, level: q.level, seen: 0, correct: 0, wrong: 0, streak: 0, lastAt: 0 };
  return {
    ...base,
    level: q.level,
    seen: base.seen + 1,
    correct: base.correct + (ok ? 1 : 0),
    wrong: base.wrong + (ok ? 0 : 1),
    streak: ok ? base.streak + 1 : 0,
    lastAt: now,
  };
}

export function levelProgress(bank: KenteiQuestion[], records: Map<string, KenteiRecord>, level: KenteiLevel) {
  const qs = bank.filter((q) => q.level === level);
  return {
    total: qs.length,
    mastered: qs.filter((q) => isMastered(records.get(q.id))).length,
    review: qs.filter((q) => bucketOf(records.get(q.id)) === 0).length,
  };
}
