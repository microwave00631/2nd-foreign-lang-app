import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Word } from '../db/schema';
import {
  analyzeWord,
  articleId,
  fetchArticle,
  getCachedLookup,
  lookupKey,
  putCachedLookup,
  formIndex,
  ReaderError,
  saveLookup,
  sentenceAt,
  tokenize,
  undoCreate,
  type Analysis,
  type Article,
  type SaveResult,
} from '../lib/reader';
import { normalizeRu } from '../lib/langs';
import { SpeakButton } from '../components/SpeakButton';

const LANG = 'ru' as const;
const LAST_KEY = 'reader:last';
const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;

function loadLast(): Article | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as Article) : null;
  } catch {
    return null;
  }
}
function storeLast(a: Article) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(a));
  } catch {
    /* 保存できなくても読むのには困らない */
  }
}

interface Picked {
  p: number;
  start: number;
  word: string;
  sentence: string;
}

type Sheet =
  | { state: 'loading'; picked: Picked; stage: Stage; startedAt: number }
  | { state: 'error'; picked: Picked; message: string; needsKey: boolean }
  | { state: 'done'; picked: Picked; analysis: Analysis; saved: SaveResult | null; cached: boolean; saveError?: string; undone?: boolean };

/** 解説ができるまでのどこにいるか(止まったときに画面で分かるように) */
type Stage = 'cache' | 'server' | 'save';
const STAGE_LABEL: Record<Stage, string> = {
  cache: '端末の記録を確認中…',
  server: 'サーバーで解説を作成中…',
  save: '単語帳に保存中…',
};
/** 端末のデータベース操作がこれ以上かかったら諦めて先に進む */
const DB_TIMEOUT_MS = 6000;
/** これ以上待たされたら「やり直す」を出す */
const SLOW_MS = 12000;

interface LookupResult {
  analysis: Analysis;
  saved: SaveResult | null;
  cached: boolean;
  saveError?: string;
}

export function ReaderPage() {
  const [params, setParams] = useSearchParams();
  const [article, setArticle] = useState<Article | null>(() => loadLast());
  const [url, setUrl] = useState(article?.url ?? '');
  const [pasteMode, setPasteMode] = useState(false);
  const [pasted, setPasted] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; needsKey: boolean } | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const reqId = useRef(0);
  // 解説を取得中の位置(同じ位置を連打しても API は1回だけ)
  const pending = useRef(new Map<string, Promise<LookupResult>>());

  const words = useLiveQuery(
    () => db.words.where('[lang+headword]').between([LANG, ''], [LANG, '￿']).toArray(),
    [],
    [] as Word[],
  );
  const known = useMemo(() => formIndex(words), [words]);

  const open = useCallback(async (target: string) => {
    const u = target.trim();
    if (!u) return;
    setLoading(true);
    setError(null);
    setSheet(null);
    try {
      const a = await fetchArticle(u);
      setArticle(a);
      setUrl(a.url ?? u);
      storeLast(a);
      window.scrollTo({ top: 0 });
    } catch (e) {
      const err = e instanceof ReaderError ? e : new ReaderError('読み込めませんでした');
      setError({ message: err.message, needsKey: err.needsKey });
    } finally {
      setLoading(false);
    }
  }, []);

  // ?url=... で開かれたら(ショートカットや共有から)そのまま読み込む
  useEffect(() => {
    const u = params.get('url');
    const text = params.get('text');
    if (u) {
      setUrl(u);
      void open(u);
    } else if (text) {
      const a = { title: '貼り付けたテキスト', paragraphs: splitParagraphs(text) };
      setArticle(a);
      storeLast(a);
    }
    if (u || text) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (pasteMode) {
      const paragraphs = splitParagraphs(pasted);
      if (!paragraphs.length) return;
      const a = { title: '貼り付けたテキスト', paragraphs };
      setArticle(a);
      storeLast(a);
      setPasted('');
      setPasteMode(false);
      setSheet(null);
    } else {
      void open(url);
    }
  };

  const lookUp = useCallback(
    async (picked: Picked, fresh = false) => {
      const id = ++reqId.current;
      setSheet({ state: 'loading', picked, stage: 'cache', startedAt: Date.now() });
      if (!article) return;
      const cacheKey = lookupKey(articleId(article), picked.p, picked.start, picked.word);
      if (fresh) pending.current.delete(cacheKey);
      // 進み具合は「今その位置の解説を待っているシート」にだけ反映する
      const onStage = (stage: Stage) =>
        setSheet((s) => (s?.state === 'loading' && key(s.picked) === key(picked) ? { ...s, stage } : s));
      let job = pending.current.get(cacheKey);
      if (!job) {
        const j: Promise<LookupResult> = resolveLookup(cacheKey, picked, article.url, onStage).finally(() => {
          if (pending.current.get(cacheKey) === j) pending.current.delete(cacheKey);
        });
        job = j;
        pending.current.set(cacheKey, job);
      }
      try {
        const r = await job;
        if (id !== reqId.current) return;
        setSheet({ state: 'done', picked, ...r });
      } catch (e) {
        if (id !== reqId.current) return;
        const err = e instanceof ReaderError ? e : new ReaderError('解説を取得できませんでした');
        setSheet({ state: 'error', picked, message: err.message, needsKey: err.needsKey });
      }
    },
    [article],
  );

  const close = () => {
    reqId.current++;
    setSheet(null);
  };

  const undo = async () => {
    if (sheet?.state !== 'done' || !sheet.saved?.created || !sheet.saved.word.id) return;
    await undoCreate(sheet.saved.word.id);
    setSheet({ ...sheet, undone: true });
  };

  return (
    <div className="reader">
      <h1>読む</h1>
      <form onSubmit={onSubmit} className="reader-form">
        {pasteMode ? (
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="ロシア語の文章を貼り付け"
            rows={5}
          />
        ) : (
          <input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="記事の URL を貼り付け"
            autoCapitalize="off"
            autoCorrect="off"
          />
        )}
        <div className="reader-form-row">
          <button className="btn-primary" disabled={loading}>
            {loading ? '読み込み中…' : pasteMode ? 'このテキストを読む' : '開く'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setPasteMode((v) => !v)}>
            {pasteMode ? 'URL で開く' : 'テキストを貼る'}
          </button>
        </div>
      </form>

      {error && (
        <p className="error-text">
          {error.message}
          {error.needsKey && (
            <>
              {' '}
              → <Link to="/settings">設定へ</Link>
            </>
          )}
        </p>
      )}

      {!article && !error && (
        <div className="card muted reader-help">
          ロシア語の記事の URL を貼って「開く」。知らない単語を<b>長押し</b>すると、辞書形・日本語訳・格や支配などの文法解説が出て、その単語は単語帳(ロシア語)に入ります。
          <br />
          色の付いた単語は単語帳にある単語です。
        </div>
      )}

      {article && (
        <>
          <ArticleBody article={article} known={known} onPick={lookUp} activeKey={sheet ? key(sheet.picked) : null} />
          {article.url && (
            <p className="muted reader-source">
              出典: <a href={article.url} target="_blank" rel="noreferrer">{hostOf(article.url)}</a>
            </p>
          )}
        </>
      )}

      {sheet && <WordSheet sheet={sheet} onClose={close} onUndo={() => void undo()} onRetry={() => void lookUp(sheet.picked, true)} />}
    </div>
  );
}

/**
 * 長押しした位置の解説を用意する。
 * 同じ記事・同じ位置・同じ単語ならキャッシュを返す(API を呼ばず、長押し回数も増やさない)。
 * 初めての位置なら API で解説を作り、単語帳に登録(既にある単語なら回数+1)してキャッシュする。
 */
async function resolveLookup(
  cacheKey: string,
  picked: Picked,
  url: string | undefined,
  onStage: (s: Stage) => void,
): Promise<LookupResult> {
  // 端末のデータベースが応答しなくても(別タブの古い版が更新を止めている等)、解説の表示は止めない
  onStage('cache');
  const hit = await withTimeout(getCachedLookup(LANG, cacheKey), DB_TIMEOUT_MS).catch((e) => {
    console.warn('[reader] cache read failed', e);
    return null;
  });
  if (hit) return { ...hit, cached: true };

  onStage('server');
  const analysis = await analyzeWord(LANG, picked.word, picked.sentence);

  onStage('save');
  let saved: SaveResult | null = null;
  let saveError: string | undefined;
  try {
    saved = await withTimeout(saveLookup(LANG, analysis, picked.sentence, url), DB_TIMEOUT_MS);
  } catch (e) {
    console.warn('[reader] save failed', e);
    saveError = e instanceof TimeoutError ? DB_STUCK_MESSAGE : '単語帳に保存できませんでした';
  }
  // キャッシュの書き込みは待たない(遅くても解説はすぐ出す)
  void putCachedLookup(cacheKey, analysis, picked.sentence, url, saved?.word.id ?? null).catch((e) =>
    console.warn('[reader] cache write failed', e),
  );
  return { analysis, saved, cached: false, saveError };
}

const DB_STUCK_MESSAGE =
  '単語帳への保存が応答しませんでした。ほかのタブやアプリで語彙トレを開いていたら閉じてから、このページを再読み込みしてください';

class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(`timeout ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const key = (p: { p: number; start: number }) => `${p.p}:${p.start}`;

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n|\r?\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function hostOf(u: string) {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
}

// ---------------- 本文(長押し検出) ----------------

const ArticleBody = memo(function ArticleBody({
  article,
  known,
  onPick,
  activeKey,
}: {
  article: Article;
  known: Map<string, Word>;
  onPick: (p: Picked) => void;
  activeKey: string | null;
}) {
  const tokens = useMemo(() => article.paragraphs.map(tokenize), [article]);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);

  const cancel = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-w]');
    if (!el) return;
    cancel();
    const p = Number(el.dataset.p);
    const start = Number(el.dataset.s);
    const timer = window.setTimeout(() => {
      press.current = null;
      const paragraph = article.paragraphs[p];
      const word = el.textContent ?? '';
      if ('vibrate' in navigator) navigator.vibrate?.(15);
      onPick({ p, start, word, sentence: sentenceAt(paragraph, start) });
    }, LONG_PRESS_MS);
    press.current = { timer, x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pr = press.current;
    if (pr && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > MOVE_TOLERANCE) cancel();
  };

  useEffect(() => cancel, []);

  return (
    <article
      className="reader-body"
      lang="ru"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {article.title && !article.paragraphs[0]?.startsWith(article.title) && <h2 className="reader-title">{article.title}</h2>}
      {tokens.map((toks, p) => (
        <p key={p}>
          {toks.map((t) => {
            if (!t.word) return t.text;
            const w = known.get(normalizeRu(t.text));
            const cls = ['tok', w ? `known k-${w.stage}` : '', activeKey === `${p}:${t.start}` ? 'active' : '']
              .filter(Boolean)
              .join(' ');
            return (
              <span key={t.start} className={cls} data-w="" data-p={p} data-s={t.start}>
                {t.text}
              </span>
            );
          })}
        </p>
      ))}
    </article>
  );
});

// ---------------- 解説シート ----------------

function WordSheet({
  sheet,
  onClose,
  onUndo,
  onRetry,
}: {
  sheet: Sheet;
  onClose: () => void;
  onUndo: () => void;
  onRetry: () => void;
}) {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="word-sheet" role="dialog" aria-label="単語の解説">
        <button className="sheet-close" onClick={onClose} aria-label="閉じる">
          ×
        </button>
        <div className="sheet-surface" lang="ru">{sheet.picked.word}</div>

        {sheet.state === 'loading' && <LoadingView sheet={sheet} onRetry={onRetry} />}

        {sheet.state === 'error' && (
          <>
            <p className="error-text">{sheet.message}</p>
            {sheet.needsKey ? (
              <Link to="/settings">設定でアクセスキーを入力</Link>
            ) : (
              <button className="btn-secondary" onClick={onRetry}>
                もう一度
              </button>
            )}
          </>
        )}

        {sheet.state === 'done' && <AnalysisView sheet={sheet} onUndo={onUndo} />}
      </section>
    </>
  );
}

function AnalysisView({ sheet, onUndo }: { sheet: Extract<Sheet, { state: 'done' }>; onUndo: () => void }) {
  const a = sheet.analysis;
  const chips = [a.pos, a.gender, a.aspect].filter(Boolean);
  return (
    <div className="analysis">
      <div className="analysis-lemma">
        <span lang="ru">{a.lemmaStressed}</span>
        <SpeakButton text={a.lemma} lang={LANG} />
      </div>
      {chips.length > 0 && (
        <div className="chips">
          {chips.map((c) => (
            <span key={c} className="chip">
              {c}
            </span>
          ))}
        </div>
      )}
      <div className="analysis-meaning">{a.meaningJa}</div>
      {a.contextJa && a.contextJa !== a.meaningJa && <div className="muted">この文では: {a.contextJa}</div>}

      <dl className="analysis-grid">
        {a.form && (
          <>
            <dt>この形</dt>
            <dd>
              <b>{a.form}</b>
              {a.formReason && <div className="reason">{a.formReason}</div>}
            </dd>
          </>
        )}
        {a.government && (
          <>
            <dt>支配</dt>
            <dd lang="ru">{a.government}</dd>
          </>
        )}
        {a.aspectPair && (
          <>
            <dt>体のペア</dt>
            <dd lang="ru">{a.aspectPair}</dd>
          </>
        )}
        {a.notes && (
          <>
            <dt>メモ</dt>
            <dd>{a.notes}</dd>
          </>
        )}
      </dl>

      <div className="analysis-sentence">
        <div lang="ru">{sheet.picked.sentence}</div>
        {a.sentenceJa && <div className="muted">{a.sentenceJa}</div>}
      </div>

      <div className="analysis-saved">
        {sheet.undone ? (
          <span className="muted">登録を取り消しました</span>
        ) : sheet.saved?.created ? (
          <>
            <span>✓ 知らない単語に追加しました</span>
            <button className="btn-small" onClick={onUndo}>
              取り消す
            </button>
          </>
        ) : sheet.saved && sheet.cached ? (
          <span>✓ 単語帳にあります(この箇所は調べ済み・長押し {sheet.saved.word.lookupCount ?? 1} 回)</span>
        ) : sheet.saved ? (
          <span>✓ 単語帳にあります(長押し {sheet.saved.word.lookupCount ?? 1} 回目)</span>
        ) : (
          <span className="error-text">{sheet.saveError ?? '単語帳に保存できませんでした'}</span>
        )}
      </div>
    </div>
  );
}

function LoadingView({ sheet, onRetry }: { sheet: Extract<Sheet, { state: 'loading' }>; onRetry: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - sheet.startedAt) / 1000));
  return (
    <div className="loading-view">
      <p className="muted">
        {STAGE_LABEL[sheet.stage]}({elapsed}秒)
      </p>
      {now - sheet.startedAt > SLOW_MS && (
        <>
          <p className="muted loading-hint">
            時間がかかっています。止まっている場合は、この表示({STAGE_LABEL[sheet.stage]})を教えてください。
          </p>
          <button className="btn-secondary" onClick={onRetry}>
            やり直す
          </button>
        </>
      )}
    </div>
  );
}
