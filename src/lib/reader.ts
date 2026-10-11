// 読む画面: 記事の取得・単語の解説(vocab-reader Edge Function)と、未知語の登録
import { db, getSettings, type Lang, type LookupCacheEntry, type Word, type WordExample } from '../db/schema';
import { INITIAL_SRS } from './srs';
import { startOfLocalDay } from './time';
import { normalizeRu } from './langs';

export const READER_ENDPOINT: string =
  import.meta.env.VITE_READER_ENDPOINT ?? 'https://hhuusudriibtpghdimzq.supabase.co/functions/v1/vocab-reader';

export interface Article {
  url?: string;
  title: string;
  paragraphs: string[];
}

export interface Analysis {
  word: string;
  lemma: string;
  lemmaStressed: string;
  pos: string;
  meaningJa: string;
  contextJa: string;
  form: string;
  formReason: string;
  gender: string;
  aspect: string;
  aspectPair: string;
  government: string;
  notes: string;
  sentenceJa: string;
}

export class ReaderError extends Error {
  constructor(message: string, readonly needsKey = false) {
    super(message);
  }
}

async function call<T>(body: object, timeoutMs: number): Promise<T> {
  const { readerKey } = await getSettings();
  if (!readerKey) throw new ReaderError('設定画面で「読む」のアクセスキーを入力してください', true);
  if (!navigator.onLine) throw new ReaderError('オフラインです');
  let res: Response;
  try {
    res = await fetch(READER_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-key': readerKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ReaderError('サーバーにつながりませんでした');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ReaderError(json.error ?? `エラー (${res.status})`, res.status === 401);
  return json as T;
}

export const fetchArticle = (url: string) => call<Article>({ mode: 'fetch', url }, 30_000);
export const analyzeWord = (lang: Lang, word: string, sentence: string) =>
  call<Analysis>({ mode: 'analyze', lang, word, sentence }, 40_000);

// ---------------- テキスト処理(純関数) ----------------

export interface Token {
  text: string;
  /** 長押しできる単語か(ロシア語ならキリル文字を含む語) */
  word: boolean;
  start: number;
}

const WORD_RE = /[\p{L}\p{M}]+(?:[-‐'’][\p{L}\p{M}]+)*/gu;
const CYR_RE = /[Ѐ-ӿ]/;

/** 段落を単語とそれ以外(空白・記号・数字)に分ける。連結すると元の文字列に戻る */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i), word: false, start: last });
    out.push({ text: m[0], word: CYR_RE.test(m[0]), start: i });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), word: false, start: last });
  return out;
}

/** offset の位置を含む1文を段落から切り出す(長すぎるときは前後を詰める) */
export function sentenceAt(paragraph: string, offset: number, max = 600): string {
  const ends = /[.!?…]+["»”)]*\s+|[;:]\s+(?=[А-ЯЁA-Z«"])/g;
  let start = 0;
  let end = paragraph.length;
  for (const m of paragraph.matchAll(ends)) {
    const i = (m.index ?? 0) + m[0].length;
    if (i <= offset) start = i;
    else {
      end = i;
      break;
    }
  }
  let s = paragraph.slice(start, end).trim();
  if (s.length > max) {
    const rel = offset - start;
    const from = Math.max(0, rel - max / 2);
    s = '…' + s.slice(from, from + max) + '…';
  }
  return s;
}

// ---------------- 未知語の登録 ----------------

export interface SaveResult {
  word: Word;
  created: boolean;
}

/**
 * 長押しした単語を「知らない単語」として単語帳に入れる。
 * 既にあれば例文と語形を足して長押し回数を増やす(学習段階はそのまま)。
 */
export async function saveLookup(lang: Lang, a: Analysis, sentence: string, url?: string): Promise<SaveResult> {
  const now = Date.now();
  const surface = a.word.toLowerCase();
  const example: WordExample = {
    surface: a.word,
    sentence,
    sentenceJa: a.sentenceJa,
    form: a.form,
    formReason: a.formReason,
    contextJa: a.contextJa,
    url,
    at: now,
  };
  const grammar = {
    gender: a.gender || undefined,
    aspect: a.aspect || undefined,
    aspectPair: a.aspectPair || undefined,
    government: a.government || undefined,
    notes: a.notes || undefined,
  };

  return db.transaction('rw', db.words, async () => {
    const existing = await db.words.where('[lang+headword]').equals([lang, a.lemma]).first();
    if (existing) {
      const examples = [example, ...(existing.examples ?? []).filter((e) => e.sentence !== sentence)].slice(0, 5);
      const forms = Array.from(new Set([...(existing.forms ?? []), surface, a.lemma.toLowerCase()]));
      const patch: Partial<Word> = {
        examples,
        forms,
        lookupCount: (existing.lookupCount ?? 0) + 1,
        grammar: { ...existing.grammar, ...grammar },
      };
      // 意味・読みが空(検索画面で登録した語など)なら補う
      if (!existing.meaningJa) patch.meaningJa = a.meaningJa;
      if (!existing.reading) patch.reading = a.lemmaStressed;
      if (!existing.pos) patch.pos = a.pos;
      await db.words.update(existing.id!, patch);
      return { word: { ...existing, ...patch }, created: false };
    }
    const w: Word = {
      lang,
      headword: a.lemma,
      reading: a.lemmaStressed,
      meaningJa: a.meaningJa || a.contextJa,
      pos: a.pos,
      tags: ['読む'],
      source: 'reader',
      addedAt: now,
      ...INITIAL_SRS,
      dueAt: startOfLocalDay(now),
      grammar,
      examples: [example],
      forms: Array.from(new Set([surface, a.lemma.toLowerCase()])),
      lookupCount: 1,
    };
    w.id = await db.words.add(w);
    return { word: w, created: true };
  });
}

/** 登録の取り消し(新規登録した直後だけ) */
export async function undoCreate(id: number): Promise<void> {
  await db.words.delete(id);
  await db.reviews.where('wordId').equals(id).delete();
}

/** 読む画面のハイライト用: 語形(正規化済み) → 単語 */
export function formIndex(words: Word[]): Map<string, Word> {
  const m = new Map<string, Word>();
  for (const w of words) {
    for (const f of [w.headword, ...(w.forms ?? [])]) m.set(normalizeRu(f), w);
  }
  return m;
}

// ---------------- 長押し結果のキャッシュ ----------------
// 同じ記事の同じ位置の同じ単語は、解説を作り直さず(トークンを使わず)、長押し回数も増やさない。
// 位置が違えば文脈が違うので、新しく解説を作る。

const CACHE_LIMIT = 2000;

/** 記事を識別する ID。URL があれば URL、貼り付けテキストなら本文のハッシュ */
export function articleId(a: Article): string {
  if (a.url) return a.url;
  // FNV-1a(32bit)。同じ本文なら同じ ID になれば十分
  let h = 0x811c9dc5;
  const text = a.paragraphs.join('\n');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `text:${(h >>> 0).toString(16)}:${text.length}`;
}

export function lookupKey(docId: string, p: number, start: number, word: string): string {
  return `${docId}|${p}|${start}|${word}`;
}

export interface CachedLookup {
  analysis: Analysis;
  saved: SaveResult | null;
}

/**
 * キャッシュにあれば解説と単語帳の状態を返す(API は呼ばない・回数も増やさない)。
 * 単語帳から消されていたら(取り消し・削除)、もう一度登録する。
 */
export async function getCachedLookup(lang: Lang, key: string): Promise<CachedLookup | null> {
  const hit = await db.lookupCache.get(key);
  if (!hit) return null;
  const analysis = hit.analysis as Analysis;
  const word =
    (hit.wordId != null ? await db.words.get(hit.wordId) : undefined) ??
    (await db.words.where('[lang+headword]').equals([lang, analysis.lemma]).first());
  if (word) {
    if (word.id !== hit.wordId) await db.lookupCache.update(key, { wordId: word.id ?? null });
    return { analysis, saved: { word, created: false } };
  }
  const saved = await saveLookup(lang, analysis, hit.sentence, hit.url);
  await db.lookupCache.update(key, { wordId: saved.word.id ?? null });
  return { analysis, saved };
}

export async function putCachedLookup(key: string, analysis: Analysis, sentence: string, url: string | undefined, wordId: number | null): Promise<void> {
  const entry: LookupCacheEntry = { key, analysis, sentence, url, wordId, at: Date.now() };
  await db.lookupCache.put(entry);
  const n = await db.lookupCache.count();
  if (n > CACHE_LIMIT) {
    const old = await db.lookupCache.orderBy('at').limit(n - CACHE_LIMIT).primaryKeys();
    await db.lookupCache.bulkDelete(old);
  }
}
