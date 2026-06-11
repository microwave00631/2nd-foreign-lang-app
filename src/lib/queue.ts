// 日次学習キュー: 「学習者とアプリDBの差分」を埋める語の選定。
import { db, getSettings, type Lang, type Word } from '../db/schema';
import { INITIAL_SRS } from './srs';
import { endOfLocalDay, startOfLocalDay } from './time';

export interface QueueCounts {
  due: number;
  freshNew: number; // 今日投入できる新規語数(辞書からの残り含む)
}

/** 期日到来語(lapsesが多い順 → 期日が古い順) */
export async function getDueWords(lang: Lang, now: number): Promise<Word[]> {
  const due = await db.words
    .where('dueAt')
    .between(1, endOfLocalDay(now), true, true)
    .filter((w) => w.lang === lang)
    .toArray();
  return due.sort((a, b) => b.lapses - a.lapses || a.dueAt - b.dueAt);
}

/** 学習セット内の未着手(new)語 */
export async function getNewWords(lang: Lang): Promise<Word[]> {
  const words = await db.words.where('[lang+stage]').equals([lang, 'new']).toArray();
  return words.sort((a, b) => a.addedAt - b.addedAt);
}

/** 今日すでに新規導入した語数(初回レビューが今日の語) */
async function newIntroducedToday(lang: Lang, now: number): Promise<number> {
  const since = startOfLocalDay(now);
  const reviews = await db.reviews.where('at').aboveOrEqual(since).toArray();
  if (reviews.length === 0) return 0;
  const firstReviewIds = new Set<number>();
  for (const r of reviews) firstReviewIds.add(r.wordId);
  let count = 0;
  for (const id of firstReviewIds) {
    const w = await db.words.get(id);
    if (!w || w.lang !== lang) continue;
    const earlier = await db.reviews
      .where('wordId')
      .equals(id)
      .filter((r) => r.at < since)
      .count();
    if (earlier === 0) count++;
  }
  return count;
}

/**
 * 辞書から levelOrder 順に、学習セット未登録の語を `limit` 件まで自動投入する。
 * HSK1 → HSK2 → … と「アプリDBとの差分」をレベル単位で埋めていく。
 */
export async function intakeFromDictionary(lang: Lang, limit: number, now: number): Promise<Word[]> {
  if (limit <= 0) return [];
  const added: Word[] = [];
  let offset = 0;
  const PAGE = 50;
  while (added.length < limit) {
    const page = await db.dictionary
      .where('[lang+levelOrder]')
      .between([lang, -Infinity], [lang, Infinity])
      .offset(offset)
      .limit(PAGE)
      .toArray();
    if (page.length === 0) break;
    offset += page.length;
    for (const e of page) {
      if (added.length >= limit) break;
      const exists = await db.words.where('[lang+headword]').equals([lang, e.headword]).first();
      if (exists) continue;
      const w: Word = {
        lang: e.lang,
        headword: e.headword,
        reading: e.reading,
        meaningJa: e.meaningJa,
        pos: e.pos,
        level: e.level,
        tags: e.tags,
        source: 'seed',
        addedAt: now,
        ...INITIAL_SRS,
        dueAt: startOfLocalDay(now),
      };
      w.id = await db.words.add(w);
      added.push(w);
    }
  }
  return added;
}

/** ホーム画面用: 復習・新規の件数(新規は学習セット内 new + 今日の投入余地) */
export async function getQueueCounts(lang: Lang, now: number): Promise<QueueCounts> {
  const settings = await getSettings();
  const due = (await getDueWords(lang, now)).filter((w) => w.stage !== 'new').length;
  const newInSet = (await getNewWords(lang)).length;
  const introduced = await newIntroducedToday(lang, now);
  const room = Math.max(0, settings.dailyNewLimit - introduced - newInSet);
  let fromDict = 0;
  if (room > 0) {
    // 辞書の未登録語数を最大 room 件までカウント
    const dictTotal = await db.dictionary.where('[lang+headword]').between([lang, ''], [lang, '￿']).count();
    const inSet = await db.words.where('[lang+headword]').between([lang, ''], [lang, '￿']).count();
    fromDict = Math.min(room, Math.max(0, dictTotal - inSet));
  }
  return { due, freshNew: Math.min(settings.dailyNewLimit, newInSet + fromDict) };
}

/**
 * セッション用キューを構築: 期日復習を優先し、残り枠に新規語を充当。
 * 新規語が足りなければ辞書から自動投入する。
 */
export async function buildSessionQueue(lang: Lang, now: number, maxCards = 20): Promise<Word[]> {
  const settings = await getSettings();
  const due = (await getDueWords(lang, now)).filter((w) => w.stage !== 'new');
  const queue: Word[] = due.slice(0, maxCards);

  if (queue.length < maxCards) {
    const introduced = await newIntroducedToday(lang, now);
    let newBudget = Math.min(maxCards - queue.length, Math.max(0, settings.dailyNewLimit - introduced));
    if (newBudget > 0) {
      const newInSet = await getNewWords(lang);
      const take = newInSet.slice(0, newBudget);
      queue.push(...take);
      newBudget -= take.length;
      if (newBudget > 0) {
        queue.push(...(await intakeFromDictionary(lang, newBudget, now)));
      }
    }
  }
  return queue;
}
