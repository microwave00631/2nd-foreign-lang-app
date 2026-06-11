import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, type Word } from '../db/schema';
import { buildSessionQueue } from '../lib/queue';
import { buildQuizCard, type QuizCard } from '../lib/quiz';
import { applyReview, gradeAnswer } from '../lib/srs';
import { useSettings } from '../context/SettingsContext';
import { PresentCard } from '../components/PresentCard';
import { QuizMC } from '../components/QuizMC';
import { QuizTyping } from '../components/QuizTyping';

type Phase = 'loading' | 'empty' | 'present' | 'quiz' | 'done';

export function QuizPage() {
  const { settings, loaded } = useSettings();
  const [queue, setQueue] = useState<Word[]>([]);
  const [index, setIndex] = useState(0);
  const [card, setCard] = useState<QuizCard | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [results, setResults] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 });
  // 同一セッション内の再出題(誤答分)は SM-2 に反映しない
  const answeredOnce = useRef<Set<number>>(new Set());
  const cardShownAt = useRef(0);

  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    buildSessionQueue(settings.activeLang, Date.now()).then((q) => {
      if (!alive) return;
      setQueue(q);
      setPhase(q.length === 0 ? 'empty' : 'loading');
    });
    return () => {
      alive = false;
    };
    // セッションは初回ロード時に一度だけ構築する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, settings.activeLang]);

  useEffect(() => {
    if (queue.length === 0 || index >= queue.length) {
      if (queue.length > 0 && index >= queue.length) setPhase('done');
      return;
    }
    let alive = true;
    buildQuizCard(queue[index]).then((c) => {
      if (!alive) return;
      setCard(c);
      setPhase(c.present && !answeredOnce.current.has(c.word.id!) ? 'present' : 'quiz');
      cardShownAt.current = Date.now();
    });
    return () => {
      alive = false;
    };
  }, [queue, index]);

  const startQuiz = useCallback(() => {
    setPhase('quiz');
    cardShownAt.current = Date.now();
  }, []);

  const onAnswer = useCallback(
    async (correct: boolean) => {
      if (!card) return;
      const word = card.word;
      const now = Date.now();
      const responseMs = now - cardShownAt.current;
      const firstAttempt = !answeredOnce.current.has(word.id!);

      if (firstAttempt) {
        answeredOnce.current.add(word.id!);
        const quality = gradeAnswer(card.quizType, correct, responseMs);
        const next = applyReview(word, quality, now);
        await db.words.update(word.id!, { ...next });
        await db.reviews.add({
          wordId: word.id!,
          at: now,
          quizType: card.quizType,
          direction: card.direction,
          correct,
          grade: quality,
          responseMs,
          intervalAfter: next.intervalDays,
        });
        setResults((r) => ({ correct: r.correct + (correct ? 1 : 0), total: r.total + 1 }));
      }

      // 誤答はセッション末尾に再出題(正解するまで)
      if (!correct) {
        setQueue((q) => [...q, word]);
      }
      setIndex((i) => i + 1);
    },
    [card],
  );

  if (phase === 'loading') return <p className="muted">読み込み中…</p>;

  if (phase === 'empty') {
    return (
      <div className="summary-box">
        <h1>今日のキューは空です 🎉</h1>
        <p className="muted">
          すべて消化済みです。<Link to="/search">翻訳・検索</Link>から新しい単語を追加できます。
        </p>
      </div>
    );
  }

  if (phase === 'done') {
    const rate = results.total > 0 ? Math.round((results.correct / results.total) * 100) : 0;
    return (
      <div className="summary-box">
        <h1>セッション完了!</h1>
        <div className="big">{rate}%</div>
        <p>
          {results.total}問中 {results.correct}問正解
        </p>
        <Link to="/">
          <button className="btn-primary" style={{ marginTop: 16 }}>
            ホームへ戻る
          </button>
        </Link>
      </div>
    );
  }

  const progress = queue.length > 0 ? Math.min(100, (index / queue.length) * 100) : 0;

  return (
    <div>
      <div className="quiz-progress">
        <div style={{ width: `${progress}%` }} />
      </div>
      {card && phase === 'present' && <PresentCard word={card.word} onNext={startQuiz} />}
      {card && phase === 'quiz' && card.quizType === 'typing' && (
        <QuizTyping key={`${card.word.id}-${index}`} card={card} onAnswer={onAnswer} />
      )}
      {card && phase === 'quiz' && card.quizType !== 'typing' && (
        <QuizMC key={`${card.word.id}-${index}`} card={card} onAnswer={onAnswer} />
      )}
    </div>
  );
}
