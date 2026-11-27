import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db/schema';
import { ASPECT_RU, ASPECT_RULES } from '../data/aspectRu';
import { buildSession, nextRecord, ruleStats, weakRules, type KenteiRecord, type SessionQuestion } from '../lib/kentei';
import { KenteiCard, fill } from './Kentei';

type Phase = 'menu' | 'quiz' | 'done';

export function AspectPage() {
  const [records, setRecords] = useState<Map<string, KenteiRecord>>(new Map());
  const [phase, setPhase] = useState<Phase>('menu');
  const [mode, setMode] = useState<'all' | 'weak' | string>('all');
  const [questions, setQuestions] = useState<SessionQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    db.kentei.toArray().then((rs) => setRecords(new Map(rs.map((r) => [r.id, r]))));
  }, []);

  const stats = useMemo(() => ruleStats(ASPECT_RU, records), [records]);
  const weak = useMemo(() => weakRules(stats), [stats]);

  const start = (m: 'all' | 'weak' | string) => {
    const bank =
      m === 'all' ? ASPECT_RU : m === 'weak' ? ASPECT_RU.filter((q) => weak.includes(q.rule!)) : ASPECT_RU.filter((q) => q.rule === m);
    const qs = buildSession(bank, records, 'all');
    if (qs.length === 0) return;
    setMode(m);
    setQuestions(qs);
    setIndex(0);
    setResults([]);
    setPhase('quiz');
  };

  const answer = async (q: SessionQuestion, ok: boolean) => {
    const rec = nextRecord(records.get(q.id), q, ok, Date.now());
    setRecords((m) => new Map(m).set(q.id, rec));
    setResults((r) => [...r, ok]);
    await db.kentei.put(rec);
  };

  if (phase === 'menu') {
    return (
      <div>
        <h1>体トレーニング</h1>
        <p className="muted" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
          完了体・不完了体のどちらを使うかを、文脈の「目印」から選ぶ練習。答えると、なぜその体なのか(ルール)が出ます。
        </p>
        <button className="btn-primary" onClick={() => start('all')}>
          ⏳ 10問トレーニング
        </button>
        <button
          className="btn-secondary"
          style={{ width: '100%', marginTop: 10 }}
          disabled={weak.length === 0}
          onClick={() => start('weak')}
        >
          🎯 苦手なルールだけ{weak.length > 0 ? `(${weak.length}ルール)` : '(まだなし)'}
        </button>

        <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          ルール別の成績
          <button className="link-btn" onClick={() => setShowRules((v) => !v)} style={{ fontSize: '0.8rem' }}>
            {showRules ? '説明を隠す' : '説明を見る'}
          </button>
        </h2>
        <div className="card aspect-rules">
          {(['impf', 'pf'] as const).map((asp) => (
            <div key={asp}>
              <div className="aspect-rules-head">{asp === 'impf' ? '不完了体を使う' : '完了体を使う'}</div>
              {ASPECT_RULES.filter((r) => r.aspect === asp).map((r) => {
                const s = stats.get(r.key);
                const tried = s ? s.correct + s.wrong : 0;
                const rate = tried > 0 ? Math.round((s!.correct / tried) * 100) : null;
                return (
                  <button key={r.key} className="aspect-rule" onClick={() => start(r.key)} disabled={!s}>
                    <div className="aspect-rule-row">
                      <span>
                        {weak.includes(r.key) && '⚠️ '}
                        {r.name}
                      </span>
                      <span className="muted">{rate === null ? `${s?.total ?? 0}問` : `正答率 ${rate}%`}</span>
                    </div>
                    {showRules && (
                      <div className="muted aspect-rule-desc">
                        {r.summary}
                        {r.markers && (
                          <>
                            <br />
                            目印: <span lang="ru">{r.markers}</span>
                          </>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: '0.8rem' }}>ルール名をタップすると、そのルールだけ出題します。</p>
      </div>
    );
  }

  if (phase === 'done') {
    const score = results.filter(Boolean).length;
    const missed = questions.filter((_, i) => !results[i]);
    return (
      <div>
        <h1>体トレーニング</h1>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.2rem', fontWeight: 700 }}>
            {score} / {questions.length}
          </div>
          <div className="muted">{score === questions.length ? '全問正解!' : '間違えた問題は次回優先して出題されます'}</div>
        </div>
        {missed.length > 0 && (
          <div className="card kentei-missed">
            <b>間違えた問題</b>
            {missed.map((q) => (
              <div key={q.id} className="kentei-missed-row">
                <div lang="ru">{fill(q.sentence, q.options[q.answer])}</div>
                <div className="muted">
                  {q.topic.replace(/^体: /, '')}: {q.explain}
                </div>
              </div>
            ))}
          </div>
        )}
        <button className="btn-primary" onClick={() => start(mode)}>
          もう一回
        </button>
        <button className="btn-secondary" style={{ marginTop: 10, width: '100%' }} onClick={() => setPhase('menu')}>
          ルール別の成績へ
        </button>
        <Link to="/">
          <button className="btn-secondary" style={{ marginTop: 10, width: '100%' }}>
            ホームへ
          </button>
        </Link>
      </div>
    );
  }

  const q = questions[index];
  return (
    <div>
      <h1>体トレーニング</h1>
      <div className="quiz-progress">
        <div style={{ width: `${(index / questions.length) * 100}%` }} />
      </div>
      <KenteiCard
        key={`${q.id}:${index}`}
        q={q}
        onAnswer={(ok) => void answer(q, ok)}
        onNext={() => (index + 1 >= questions.length ? setPhase('done') : setIndex(index + 1))}
      />
    </div>
  );
}
