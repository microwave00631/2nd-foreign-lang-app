import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db/schema';
import {
  DIM_LABEL,
  OPTIONS,
  collectQuestions,
  grade,
  shuffle,
  valueLabel,
  type CaseQuestion,
  type Dim,
} from '../lib/caseQuiz';
import { SpeakButton } from '../components/SpeakButton';

const SESSION_SIZE = 10;
const ORDER: Record<CaseQuestion['posClass'], Dim[]> = {
  verb: ['tense', 'person', 'number', 'gender'],
  noun: ['case', 'number', 'gender'],
  adj: ['case', 'number', 'gender'],
  numeral: ['case', 'number', 'gender'],
  other: [],
};

type Phase = 'loading' | 'empty' | 'quiz' | 'done';

export function CaseQuizPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [pool, setPool] = useState<CaseQuestion[]>([]);
  const [questions, setQuestions] = useState<CaseQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);

  useEffect(() => {
    let alive = true;
    db.words
      .where('[lang+headword]')
      .between(['ru', ''], ['ru', '￿'])
      .toArray()
      .then((words) => {
        if (!alive) return;
        const all = collectQuestions(words);
        setPool(all);
        start(all);
      });
    return () => {
      alive = false;
    };
  }, []);

  const start = (all: CaseQuestion[]) => {
    if (all.length === 0) {
      setPhase('empty');
      return;
    }
    setQuestions(shuffle(all).slice(0, SESSION_SIZE));
    setIndex(0);
    setScore(0);
    setPhase('quiz');
  };

  if (phase === 'loading') return <p className="muted">読み込み中…</p>;

  if (phase === 'empty') {
    return (
      <div>
        <h1>格クイズ</h1>
        <div className="card muted" style={{ lineHeight: 1.7 }}>
          まだ問題がありません。「読む」でロシア語の記事を開き、名詞・形容詞・動詞を長押しして調べると、その語形が問題になります。
        </div>
        <Link to="/read">
          <button className="btn-primary">読むへ</button>
        </Link>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div>
        <h1>格クイズ</h1>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.2rem', fontWeight: 700 }}>
            {score} / {questions.length}
          </div>
          <div className="muted">全部の項目が合っていた問題の数</div>
        </div>
        <button className="btn-primary" onClick={() => start(pool)}>
          もう一回({Math.min(SESSION_SIZE, pool.length)}問)
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
      <h1>格クイズ</h1>
      <div className="quiz-progress">
        <div style={{ width: `${(index / questions.length) * 100}%` }} />
      </div>
      <QuestionCard
        key={q.key}
        q={q}
        onNext={(ok) => {
          if (ok) setScore((s) => s + 1);
          if (index + 1 >= questions.length) setPhase('done');
          else setIndex(index + 1);
        }}
      />
    </div>
  );
}

function QuestionCard({ q, onNext }: { q: CaseQuestion; onNext: (ok: boolean) => void }) {
  const [picked, setPicked] = useState<Partial<Record<Dim, string>>>({});
  const [checked, setChecked] = useState(false);
  const result = useMemo(() => (checked ? grade(q, picked) : null), [checked, q, picked]);
  const askedDims = new Map(q.asked.map((a) => [a.dim, a.answer]));
  const excusedDims = new Map(q.excused.map((e) => [e.dim, e]));
  const ready = q.asked.every((a) => picked[a.dim]);
  const ex = q.example;

  return (
    <div className="card case-card">
      <div className="case-sentence" lang="ru">
        {highlight(ex.sentence, ex.surface)}
      </div>
      <div className="case-word">
        <span lang="ru">{ex.surface}</span>
        <SpeakButton text={ex.surface} lang="ru" />
      </div>
      <div className="muted case-lemma">
        辞書形 <span lang="ru">{q.word.reading || q.word.headword}</span>・{q.word.pos}・{q.word.meaningJa}
      </div>

      <div className="case-dims">
        {ORDER[q.posClass].map((dim) => {
          const answer = askedDims.get(dim);
          const excuse = excusedDims.get(dim);
          if (answer === undefined && !excuse) return null;
          if (excuse) {
            return (
              <div key={dim} className="case-dim excused">
                <div className="case-dim-label">{DIM_LABEL[dim]}</div>
                <div className="case-excuse">
                  {excuse.value && <b>{valueLabel(dim, excuse.value)} </b>}
                  <span>— {excuse.reason}</span>
                </div>
              </div>
            );
          }
          return (
            <div key={dim} className="case-dim">
              <div className="case-dim-label">{DIM_LABEL[dim]}</div>
              <div className="case-options">
                {OPTIONS[dim].map((o) => {
                  const isPicked = picked[dim] === o.value;
                  const cls = !checked
                    ? isPicked
                      ? 'picked'
                      : ''
                    : o.value === answer
                      ? 'correct'
                      : isPicked
                        ? 'wrong'
                        : '';
                  return (
                    <button
                      key={o.value}
                      className={cls}
                      disabled={checked}
                      onClick={() => setPicked((p) => ({ ...p, [dim]: o.value }))}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {!checked ? (
        <button className="btn-primary" disabled={!ready} onClick={() => setChecked(true)}>
          答え合わせ
        </button>
      ) : (
        <>
          <div className={`answer-feedback ${result?.allOk ? 'ok' : 'ng'}`}>
            {result?.allOk ? '⭕ 正解!' : `❌ 正解: ${q.asked.map((a) => valueLabel(a.dim, a.answer)).join('・')}`}
          </div>
          <div className="case-explain">
            {ex.form && (
              <div>
                <b lang="ru">{ex.surface}</b> = {ex.form}
              </div>
            )}
            {ex.formReason && <div className="muted">{ex.formReason}</div>}
            {ex.sentenceJa && <div className="muted">訳: {ex.sentenceJa}</div>}
          </div>
          <button className="btn-primary" onClick={() => onNext(!!result?.allOk)}>
            次へ
          </button>
        </>
      )}
    </div>
  );
}

function highlight(sentence: string, surface: string) {
  const i = sentence.indexOf(surface);
  if (i < 0) return sentence;
  return (
    <>
      {sentence.slice(0, i)}
      <mark>{surface}</mark>
      {sentence.slice(i + surface.length)}
    </>
  );
}
