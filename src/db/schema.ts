// NOTE: このモジュールは Service Worker からも import されるため、DOM API に依存しないこと。
import Dexie, { type Table } from 'dexie';

export type Lang = 'zh' | 'th' | 'ru';
export type Stage = 'new' | 'learning' | 'review' | 'mastered';
export type QuizType = 'mc-recog' | 'mc-recall' | 'typing';
export type Direction = 'L2toJA' | 'JAtoL2';

export interface DictEntry {
  id?: number;
  lang: Lang;
  headword: string;
  reading: string;
  meaningJa: string;
  pos?: string;
  level: string;
  levelOrder: number;
  tags: string[];
}

export interface Word {
  id?: number;
  lang: Lang;
  headword: string;
  reading: string;
  meaningJa: string;
  pos?: string;
  level?: string;
  tags: string[];
  source: 'seed' | 'api' | 'manual' | 'reader';
  addedAt: number;
  /** 読む画面で長押しして調べたときの文法情報(ロシア語など) */
  grammar?: WordGrammar;
  /** 記事中で出会った例文(新しい順・最大5件) */
  examples?: WordExample[];
  /** 記事中で出会った語形(小文字)。読む画面のハイライトに使う */
  forms?: string[];
  /** 読む画面で長押しした回数 */
  lookupCount?: number;
  // SM-2 状態
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  dueAt: number;
  lapses: number;
  lastReviewedAt: number | null;
  stage: Stage;
}

export interface WordGrammar {
  gender?: string;
  aspect?: string;
  aspectPair?: string;
  government?: string;
  notes?: string;
}

/** 語形の文法情報(格クイズ用)。その語形で表されていない次元は持たない */
export interface GrammarTags {
  case?: 'nom' | 'gen' | 'dat' | 'acc' | 'ins' | 'prep';
  number?: 'sg' | 'pl';
  gender?: 'm' | 'f' | 'n';
  tense?: 'past' | 'present' | 'future' | 'infinitive' | 'imperative';
  person?: '1' | '2' | '3';
  /** 不変化語(кофе, метро など) */
  indeclinable?: boolean;
  /** 形容詞・形動詞の短語尾形 */
  shortForm?: boolean;
  /** 文脈からも格が1つに決まらない */
  caseAmbiguous?: boolean;
}

export interface WordExample {
  surface: string;
  sentence: string;
  sentenceJa?: string;
  form?: string;
  formReason?: string;
  contextJa?: string;
  /** 構造化した文法情報(サーバーが返したもの。古い例文には無い) */
  tags?: GrammarTags;
  url?: string;
  at: number;
}

/** 読む画面の長押し結果のキャッシュ(同じ記事の同じ位置の単語は再生成しない) */
export interface LookupCacheEntry {
  /** `${記事ID}|${段落}|${文字位置}|${単語}` */
  key: string;
  /** 解説(lib/reader の Analysis。schema を DOM 非依存に保つため unknown で持つ) */
  analysis: unknown;
  sentence: string;
  url?: string;
  wordId: number | null;
  at: number;
}

export interface Review {
  id?: number;
  wordId: number;
  at: number;
  quizType: QuizType;
  direction: Direction;
  correct: boolean;
  grade: number;
  responseMs: number;
  intervalAfter: number;
}

export interface Lookup {
  id?: number;
  lang: Lang;
  query: string;
  resultHeadword: string;
  resultReading: string;
  resultMeaningJa: string;
  source: 'dictionary' | 'api';
  at: number;
  addedWordId: number | null;
}

export interface Settings {
  key: 'app';
  activeLang: Lang;
  dailyNewLimit: number;
  notificationsEnabled: boolean;
  notificationTime: string; // 'HH:mm'
  lastNotifiedDate: string | null; // 'YYYY-MM-DD'
  apiProvider: 'mymemory' | 'deepl' | 'none';
  apiKey: string;
  apiEmail: string;
  typingToneStrict: boolean;
  dictVersionImported: { zh: number; th: number };
  streakBest: number;
  /** 読む画面のサーバー(vocab-reader)用アクセスキー */
  readerKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  key: 'app',
  activeLang: 'zh',
  dailyNewLimit: 10,
  notificationsEnabled: false,
  notificationTime: '21:00',
  lastNotifiedDate: null,
  apiProvider: 'mymemory',
  apiKey: '',
  apiEmail: '',
  typingToneStrict: false,
  dictVersionImported: { zh: 0, th: 0 },
  streakBest: 0,
  readerKey: '',
};

export class GoiDB extends Dexie {
  dictionary!: Table<DictEntry, number>;
  words!: Table<Word, number>;
  reviews!: Table<Review, number>;
  lookups!: Table<Lookup, number>;
  settings!: Table<Settings, string>;
  lookupCache!: Table<LookupCacheEntry, string>;

  constructor() {
    super('goi-tore');
    this.version(1).stores({
      dictionary: '++id, [lang+headword], [lang+level], [lang+levelOrder], headword, meaningJa',
      words: '++id, &[lang+headword], dueAt, stage, [lang+stage], addedAt',
      reviews: '++id, wordId, at',
      lookups: '++id, at, [lang+query]',
      settings: 'key',
    });
    this.version(2).stores({
      lookupCache: 'key, at',
    });
  }
}

export const db = new GoiDB();

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('app');
  // 後から増えた設定項目が古い保存データに無くても既定値で補う
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch, key: 'app' as const };
  await db.settings.put(next);
  return next;
}
