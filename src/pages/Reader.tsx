import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Word } from '../db/schema';
import {
  analyzeWord,
  fetchArticle,
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
  | { state: 'loading'; picked: Picked }
  | { state: 'error'; picked: Picked; message: string; needsKey: boolean }
  | { state: 'done'; picked: Picked; analysis: Analysis; saved: SaveResult | null; undone?: boolean };

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
    async (picked: Picked) => {
      const id = ++reqId.current;
      setSheet({ state: 'loading', picked });
      try {
        const analysis = await analyzeWord(LANG, picked.word, picked.sentence);
        if (id !== reqId.current) return;
        let saved: SaveResult | null = null;
        try {
          saved = await saveLookup(LANG, analysis, picked.sentence, article?.url);
        } catch {
          saved = null;
        }
        if (id !== reqId.current) return;
        setSheet({ state: 'done', picked, analysis, saved });
      } catch (e) {
        if (id !== reqId.current) return;
        const err = e instanceof ReaderError ? e : new ReaderError('解説を取得できませんでした');
        setSheet({ state: 'error', picked, message: err.message, needsKey: err.needsKey });
      }
    },
    [article?.url],
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

      {sheet && <WordSheet sheet={sheet} onClose={close} onUndo={() => void undo()} onRetry={() => void lookUp(sheet.picked)} />}
    </div>
  );
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

        {sheet.state === 'loading' && <p className="muted">解説を作っています…</p>}

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
        ) : sheet.saved ? (
          <span>✓ 単語帳にあります(長押し {sheet.saved.word.lookupCount ?? 1} 回目)</span>
        ) : (
          <span className="error-text">単語帳に保存できませんでした</span>
        )}
      </div>
    </div>
  );
}
