// 翻訳検索: 内蔵辞書 → 外部APIフォールバック(MyMemory / DeepL)
import { db, getSettings, type DictEntry, type Lang, type Lookup } from '../db/schema';

export interface TranslateResult {
  headword: string;
  reading: string;
  meaningJa: string;
  source: 'dictionary' | 'api';
  pos?: string;
  level?: string;
  tags: string[];
  /** タイ語API結果など、読みが自動付与できなかった場合 true */
  readingMissing?: boolean;
}

const HAN_RE = /[一-鿿]/;
const THAI_RE = /[฀-๿]/;

/** 入力スクリプトから翻訳方向を推定 */
export function detectDirection(query: string, lang: Lang): 'L2toJA' | 'JAtoL2' {
  if (lang === 'th' && THAI_RE.test(query)) return 'L2toJA';
  if (lang === 'zh' && HAN_RE.test(query) && !/[ぁ-んァ-ン]/.test(query)) return 'L2toJA';
  return 'JAtoL2';
}

/** 内蔵辞書検索: 見出し・読み・意味の部分一致 */
export async function searchDictionary(lang: Lang, query: string, limit = 20): Promise<DictEntry[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = await db.dictionary.where('[lang+headword]').between([lang, ''], [lang, '￿']).toArray();
  const scored = all
    .map((e) => {
      const head = e.headword.toLowerCase();
      const read = e.reading.toLowerCase();
      const mean = e.meaningJa.toLowerCase();
      let score = -1;
      if (head === q || read === q || mean === q) score = 0;
      else if (head.startsWith(q) || read.startsWith(q) || mean.startsWith(q)) score = 1;
      else if (head.includes(q) || read.includes(q) || mean.includes(q)) score = 2;
      return { e, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score || a.e.levelOrder - b.e.levelOrder);
  return scored.slice(0, limit).map((x) => x.e);
}

const API_TIMEOUT_MS = 6000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function translateMyMemory(query: string, from: string, to: string, email: string): Promise<string | null> {
  const params = new URLSearchParams({ q: query, langpair: `${from}|${to}` });
  if (email) params.set('de', email);
  const res = await fetchWithTimeout(`https://api.mymemory.translated.net/get?${params}`);
  if (!res.ok) return null;
  const json = await res.json();
  const text: string | undefined = json?.responseData?.translatedText;
  if (!text || /NO QUERY|INVALID|QUOTA/i.test(text)) return null;
  return text.trim();
}

async function translateDeepL(query: string, from: string, to: string, apiKey: string): Promise<string | null> {
  const res = await fetchWithTimeout('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: [query], source_lang: from.toUpperCase(), target_lang: to.toUpperCase() }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.translations?.[0]?.text?.trim() ?? null;
}

const MYMEMORY_LANG: Record<Lang, string> = { zh: 'zh-CN', th: 'th' };

/**
 * APIフォールバック翻訳。オフライン・失敗時は null。
 * DeepL はタイ語非対応のため th は常に MyMemory。
 */
export async function translateViaApi(lang: Lang, query: string, direction: 'L2toJA' | 'JAtoL2'): Promise<TranslateResult | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
  const settings = await getSettings();
  if (settings.apiProvider === 'none') return null;

  const from = direction === 'JAtoL2' ? 'ja' : MYMEMORY_LANG[lang];
  const to = direction === 'JAtoL2' ? MYMEMORY_LANG[lang] : 'ja';

  let translated: string | null = null;
  try {
    if (settings.apiProvider === 'deepl' && settings.apiKey && lang === 'zh') {
      translated = await translateDeepL(query, direction === 'JAtoL2' ? 'ja' : 'zh', direction === 'JAtoL2' ? 'zh' : 'ja', settings.apiKey);
    }
    if (!translated) {
      translated = await translateMyMemory(query, from, to, settings.apiEmail);
    }
  } catch {
    return null;
  }
  if (!translated || translated.toLowerCase() === query.toLowerCase()) return null;

  const headword = direction === 'JAtoL2' ? translated : query.trim();
  const meaningJa = direction === 'JAtoL2' ? query.trim() : translated;

  let reading = '';
  let readingMissing = false;
  if (lang === 'zh') {
    // pinyin-pro は辞書データが大きいため遅延ロード
    const { pinyin } = await import('pinyin-pro');
    reading = pinyin(headword, { toneType: 'symbol' });
  } else {
    readingMissing = true; // タイ語の自動ローマ字化は非対応 → 保存前に手入力
  }
  return { headword, reading, meaningJa, source: 'api', tags: [], readingMissing };
}

export async function logLookup(lang: Lang, query: string, r: TranslateResult): Promise<number> {
  const row: Lookup = {
    lang,
    query: query.trim(),
    resultHeadword: r.headword,
    resultReading: r.reading,
    resultMeaningJa: r.meaningJa,
    source: r.source,
    at: Date.now(),
    addedWordId: null,
  };
  return db.lookups.add(row);
}
