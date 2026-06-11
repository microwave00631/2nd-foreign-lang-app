// 出題形式の選定と選択肢生成。学習段階に応じて 認識→想起→産出 とエスカレートする。
import { db, type Direction, type Lang, type QuizType, type Word } from '../db/schema';

export interface QuizCard {
  word: Word;
  quizType: QuizType;
  direction: Direction;
  /** 選択式のときのみ: 表示順にシャッフル済みの選択肢(正解を含む) */
  options?: QuizOption[];
  /** new 段階のみ: 出題前に提示カードを挟む */
  present: boolean;
}

export interface QuizOption {
  headword: string;
  reading: string;
  meaningJa: string;
  correct: boolean;
}

function pick<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

export function chooseQuizType(word: Word): { quizType: QuizType; direction: Direction; present: boolean } {
  switch (word.stage) {
    case 'new':
      return { quizType: 'mc-recog', direction: 'L2toJA', present: true };
    case 'learning':
      return Math.random() < 0.5
        ? { quizType: 'mc-recog', direction: 'L2toJA', present: false }
        : { quizType: 'mc-recall', direction: 'JAtoL2', present: false };
    case 'review':
      return Math.random() < 0.5
        ? { quizType: 'mc-recall', direction: 'JAtoL2', present: false }
        : { quizType: 'typing', direction: 'JAtoL2', present: false };
    case 'mastered':
      return { quizType: 'typing', direction: 'JAtoL2', present: false };
  }
}

/**
 * 誤答選択肢: 同言語・同レベル優先で3件。正解と同じ意味/見出しの語は除外。
 * 同レベルで足りなければ言語全体に拡大。
 */
export async function buildDistractors(lang: Lang, target: Word): Promise<QuizOption[]> {
  const exclude = (e: { headword: string; meaningJa: string }) =>
    e.headword !== target.headword && e.meaningJa !== target.meaningJa;

  let pool: { headword: string; reading: string; meaningJa: string }[] = target.level
    ? (await db.dictionary.where('[lang+level]').equals([lang, target.level]).toArray()).filter(exclude)
    : [];
  if (pool.length < 3) {
    pool = (await db.dictionary.where('[lang+headword]').between([lang, ''], [lang, '￿']).toArray()).filter(
      exclude,
    );
  }
  // 辞書が極端に小さい場合は学習セットからも補完
  if (pool.length < 3) {
    const fromWords = (await db.words.where('[lang+headword]').between([lang, ''], [lang, '￿']).toArray()).filter(
      exclude,
    );
    const seen = new Set(pool.map((p) => p.headword));
    for (const w of fromWords) if (!seen.has(w.headword)) pool.push(w);
  }
  // meaningJa の重複も除いて「正解が2つ」事故を防ぐ
  const uniq: typeof pool = [];
  const seenMeaning = new Set<string>([target.meaningJa]);
  const seenHead = new Set<string>([target.headword]);
  for (const e of pool) {
    if (seenMeaning.has(e.meaningJa) || seenHead.has(e.headword)) continue;
    seenMeaning.add(e.meaningJa);
    seenHead.add(e.headword);
    uniq.push(e);
  }
  return pick(uniq, 3).map((e) => ({
    headword: e.headword,
    reading: e.reading,
    meaningJa: e.meaningJa,
    correct: false,
  }));
}

export async function buildQuizCard(word: Word): Promise<QuizCard> {
  const { quizType, direction, present } = chooseQuizType(word);
  if (quizType === 'typing') {
    return { word, quizType, direction, present };
  }
  const distractors = await buildDistractors(word.lang, word);
  const options = pick(
    [
      { headword: word.headword, reading: word.reading, meaningJa: word.meaningJa, correct: true },
      ...distractors,
    ],
    4,
  );
  return { word, quizType, direction, options, present };
}
