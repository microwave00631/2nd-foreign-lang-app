// NOTE: このモジュールは Service Worker からも import されるため、DOM API に依存しないこと。
import Dexie, { type Table } from 'dexie';

export type Lang = 'zh' | 'th';
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
  source: 'seed' | 'api' | 'manual';
  addedAt: number;
  // SM-2 状態
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  dueAt: number;
  lapses: number;
  lastReviewedAt: number | null;
  stage: Stage;
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
};

export class GoiDB extends Dexie {
  dictionary!: Table<DictEntry, number>;
  words!: Table<Word, number>;
  reviews!: Table<Review, number>;
  lookups!: Table<Lookup, number>;
  settings!: Table<Settings, string>;

  constructor() {
    super('goi-tore');
    this.version(1).stores({
      dictionary: '++id, [lang+headword], [lang+level], [lang+levelOrder], headword, meaningJa',
      words: '++id, &[lang+headword], dueAt, stage, [lang+stage], addedAt',
      reviews: '++id, wordId, at',
      lookups: '++id, at, [lang+query]',
      settings: 'key',
    });
  }
}

export const db = new GoiDB();

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('app');
  return s ?? DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch, key: 'app' as const };
  await db.settings.put(next);
  return next;
}
