import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db/schema';
import { KENTEI_LEVELS, KENTEI_RU } from '../data/kenteiRu';
import {
  buildSession,
  levelProgress,
  nextRecord,
  bucketOf,
  type KenteiRecord,
  type LevelFilter,
  type SessionQuestion,
} from '../lib/kentei';
import { SpeakButton } from '../components/SpeakButton';
import { ASPECT_LABEL, ASPECT_RULES } from '../data/aspectRu';

type Phase = 'menu' | 'quiz' | 'done';

export function KenteiPage() {
  const [records, setRecords] = useState<Map<string, KenteiRecord>>(new Map());
  const [phase, setPhase] = useState<Phase>('menu');
  const [filter, setFilter] = useState<LevelFilter>('4');
  const [questions, setQuestions] = useState<SessionQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);

  useEffect(() => {
    db.kentei.toArray().then((rs) => setRecords(new Map(rs.map((r) => [r.id, r]))));
  }, []);

  const start = (f: LevelFilter) => {
    const qs = buildSession(KENTEI_RU, records, f);
    if (qs.length === 0) return;
    setFilter(f);
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

  const reviewCount = KENTEI_RU.filter((q) => bucketOf(records.get(q.id)) === 0).length;

  if (phase === 'menu') {
    return (
      <div>
        <h1>検定クイズ</h1>
        <p className="muted" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
          ロシア語能力検定 4〜2級レベルの文法問題。間違えた問題は優先して出題され、2回連続で正解すると習得になります。
        </p>
        {KENTEI_LEVELS.map(({ level, label, hint }) => {
          const p = levelProgress(KENTEI_RU, records, level);
          return (
            <button key={level} className="card kentei-level" onClick={() => start(level)}>
              <div className="kentei-level-head">
                <b>{label}</b>
                <span className="muted">
                  習得 {p.mastered}/{p.total}
                  {p.review > 0 && <> ・ 要復習 {p.review}</>}
                </span>
              </div>
              <div className="quiz-progress" style={{ margin: '8px 0 6px' }}>
                <div style={{ width: `${(p.mastered / p.total) * 100}%` }} />
              </div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                {hint}
              </div>
            </button>
          );
        })}
        <button className="btn-secondary" style={{ width: '100%', marginTop: 4 }} onClick={() => start('all')}>
          🎲 全級ミックス
        </button>
        <button
          className="btn-secondary"
          style={{ width: '100%', marginTop: 10 }}
          disabled={reviewCount === 0}
          onClick={() => start('wrong')}
        >
          🔁 間違えた問題だけ({reviewCount}問)
        </button>
        <Link to="/aspect">
          <button className="btn-secondary" style={{ width: '100%', marginTop: 10 }}>
            ⏳ 完了体・不完了体を集中トレーニング
          </button>
        </Link>
      </div>
    );
  }

  if (phase === 'done') {
    const score = results.filter(Boolean).length;
    const missed = questions.filter((_, i) => !results[i]);
    return (
      <div>
        <h1>検定クイズ</h1>
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
                  {q.topic}: {q.explain}
                </div>
              </div>
            ))}
          </div>
        )}
        <button className="btn-primary" onClick={() => start(filter)}>
          もう一回
        </button>
        <button className="btn-secondary" style={{ marginTop: 10, width: '100%' }} onClick={() => setPhase('menu')}>
          級を選び直す
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
      <h1>検定クイズ</h1>
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

export function KenteiCard({
  q,
  onAnswer,
  onNext,
}: {
  q: SessionQuestion;
  onAnswer: (ok: boolean) => void;
  onNext: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const ok = picked === q.shuffledAnswer;
  const filled = fill(q.sentence, q.shuffled[q.shuffledAnswer]);

  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    onAnswer(i === q.shuffledAnswer);
  };

  return (
    <div className="card case-card">
      <div className="muted kentei-meta">
        {q.level}級・{q.topic}
      </div>
      <div className="kentei-sentence" lang="ru">
        {picked === null ? q.sentence : filled}
      </div>
      <div className="muted case-lemma">{q.ja}</div>
      <div className="quiz-options">
        {q.shuffled.map((o, i) => {
          let cls = '';
          if (picked !== null) {
            if (i === q.shuffledAnswer) cls = 'correct';
            else if (i === picked) cls = 'wrong';
          }
          return (
            <button key={i} className={cls} lang="ru" onClick={() => pick(i)}>
              {o}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <>
          <div className={`answer-feedback ${ok ? 'ok' : 'ng'}`}>
            {ok ? '⭕ 正解!' : `❌ 正解: ${q.shuffled[q.shuffledAnswer]}`}
          </div>
          <div className="case-explain" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1 }}>{q.explain}</span>
            <SpeakButton text={filled} lang="ru" />
          </div>
          {q.rule && <AspectNote q={q} />}
          <button className="btn-primary" onClick={onNext}>
            次へ
          </button>
        </>
      )}
    </div>
  );
}

export function fill(sentence: string, word: string) {
  return sentence.replace('___', word).replace(/\s+([.,!?])/g, '$1');
}

function AspectNote({ q }: { q: SessionQuestion }) {
  const rule = ASPECT_RULES.find((r) => r.key === q.rule);
  return (
    <div className="aspect-note">
      <div lang="ru">
        {ASPECT_LABEL.map((label, i) => (
          <span key={label} className={i === q.answer ? 'on' : ''}>
            {label}: {q.options[i]}
          </span>
        ))}
      </div>
      {rule && (
        <div className="muted">
          <b>{rule.name}</b> — {rule.summary}
          {rule.markers && <>(目印: <span lang="ru">{rule.markers}</span>)</>}
        </div>
      )}
    </div>
  );
}
