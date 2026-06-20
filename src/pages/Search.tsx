import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DictEntry, type Word } from '../db/schema';
import { INITIAL_SRS } from '../lib/srs';
import { startOfLocalDay } from '../lib/time';
import {
  detectDirection,
  logLookup,
  searchDictionary,
  translateViaApi,
  type TranslateResult,
} from '../lib/translate';
import { useSettings } from '../context/SettingsContext';
import { SpeakButton } from '../components/SpeakButton';

export function SearchPage() {
  const { settings } = useSettings();
  const lang = settings.activeLang;
  const [query, setQuery] = useState('');
  const [dictHits, setDictHits] = useState<DictEntry[]>([]);
  const [apiResult, setApiResult] = useState<TranslateResult | null>(null);
  const [apiState, setApiState] = useState<'idle' | 'loading' | 'none' | 'offline'>('idle');
  const [editReading, setEditReading] = useState('');
  const [addedHeadwords, setAddedHeadwords] = useState<Set<string>>(new Set());

  const recent = useLiveQuery(
    () => db.lookups.orderBy('at').reverse().limit(10).toArray(),
    [],
    [],
  );

  useEffect(() => {
    setApiResult(null);
    setApiState('idle');
    let alive = true;
    searchDictionary(lang, query).then((hits) => alive && setDictHits(hits));
    return () => {
      alive = false;
    };
  }, [query, lang]);

  const searchApi = async () => {
    if (!query.trim()) return;
    if (!navigator.onLine) {
      setApiState('offline');
      return;
    }
    setApiState('loading');
    const direction = detectDirection(query, lang);
    const r = await translateViaApi(lang, query, direction);
    if (r) {
      setApiResult(r);
      setEditReading(r.reading);
      setApiState('idle');
      await logLookup(lang, query, r);
    } else {
      setApiState(navigator.onLine ? 'none' : 'offline');
    }
  };

  const addWord = async (e: { headword: string; reading: string; meaningJa: string; pos?: string; level?: string; tags?: string[] }, source: 'seed' | 'api') => {
    const exists = await db.words.where('[lang+headword]').equals([lang, e.headword]).first();
    if (exists) {
      setAddedHeadwords((s) => new Set(s).add(e.headword));
      return;
    }
    const now = Date.now();
    const w: Word = {
      lang,
      headword: e.headword,
      reading: e.reading,
      meaningJa: e.meaningJa,
      pos: e.pos,
      level: e.level,
      tags: e.tags ?? [],
      source,
      addedAt: now,
      ...INITIAL_SRS,
      dueAt: startOfLocalDay(now), // 手動追加は当日キューに割込み
    };
    const id = await db.words.add(w);
    // 直近の lookup と紐づけ
    const lookup = await db.lookups.where('[lang+query]').equals([lang, query.trim()]).last();
    if (lookup && lookup.resultHeadword === e.headword) {
      await db.lookups.update(lookup.id!, { addedWordId: id });
    }
    setAddedHeadwords((s) => new Set(s).add(e.headword));
  };

  return (
    <div>
      <h1>翻訳・検索</h1>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={lang === 'zh' ? '日本語・中国語・ピンインで検索' : '日本語・タイ語・ローマ字で検索'}
      />

      {query.trim() && dictHits.length > 0 && (
        <>
          <h2>内蔵辞書 {dictHits.length}件</h2>
          {dictHits.map((e) => (
            <div key={e.id} className="card">
              <div className="search-result-head">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{e.headword}</div>
                  <div className="muted">{e.reading}</div>
                  <div>{e.meaningJa}</div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>
                    {e.pos} {e.level?.toUpperCase()}
                  </div>
                </div>
                <SpeakButton text={e.headword} lang={lang} />
                <button
                  className="btn-small"
                  disabled={addedHeadwords.has(e.headword)}
                  onClick={() => void addWord(e, 'seed')}
                >
                  {addedHeadwords.has(e.headword) ? '追加済み' : '＋追加'}
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {query.trim() && (
        <>
          <h2>オンライン翻訳</h2>
          {apiState === 'idle' && !apiResult && (
            <button className="btn-secondary" onClick={() => void searchApi()}>
              🌐 翻訳APIで「{query.trim()}」を検索
            </button>
          )}
          {apiState === 'loading' && <p className="muted">翻訳中…</p>}
          {apiState === 'none' && <p className="error-text">翻訳結果が見つかりませんでした。</p>}
          {apiState === 'offline' && (
            <p className="error-text">オフラインのため内蔵辞書のみ検索しています。</p>
          )}
          {apiResult && (
            <div className="card">
              <div className="search-result-head">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{apiResult.headword}</div>
                  {apiResult.readingMissing || apiResult.readingApprox ? (
                    <div style={{ margin: '8px 0' }}>
                      <label className="muted" style={{ fontSize: '0.8rem' }}>
                        {apiResult.readingApprox
                          ? '読み(自動生成・近似。必要なら修正してください)'
                          : '読み方を入力してください(ローマ字)'}
                      </label>
                      <input
                        type="text"
                        value={editReading}
                        onChange={(e) => setEditReading(e.target.value)}
                        placeholder="例: sawatdii"
                      />
                    </div>
                  ) : (
                    <div className="muted">{apiResult.reading}</div>
                  )}
                  <div>{apiResult.meaningJa}</div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>翻訳API</div>
                </div>
                <SpeakButton text={apiResult.headword} lang={lang} />
                <button
                  className="btn-small"
                  disabled={addedHeadwords.has(apiResult.headword)}
                  onClick={() =>
                    void addWord({ ...apiResult, reading: editReading || apiResult.reading }, 'api')
                  }
                >
                  {addedHeadwords.has(apiResult.headword) ? '追加済み' : '＋追加'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!query.trim() && recent.length > 0 && (
        <>
          <h2>最近の検索</h2>
          {recent.map((l) => (
            <div key={l.id} className="word-row">
              <div className="w-main">
                <div className="w-head">{l.resultHeadword}</div>
                <div className="w-sub">
                  {l.resultReading && `${l.resultReading} ・ `}
                  {l.resultMeaningJa}
                </div>
              </div>
              <span className="muted" style={{ fontSize: '0.7rem' }}>
                {l.source === 'dictionary' ? '辞書' : 'API'}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
