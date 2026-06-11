import { useState } from 'react';
import type { QuizCard } from '../lib/quiz';
import { SpeakButton } from './SpeakButton';

interface Props {
  card: QuizCard;
  onAnswer: (correct: boolean) => void;
}

/** 選択式: mc-recog(L2→日本語) / mc-recall(日本語→L2) */
export function QuizMC({ card, onAnswer }: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const recog = card.quizType === 'mc-recog';
  const options = card.options ?? [];

  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    const correct = options[i].correct;
    setTimeout(() => onAnswer(correct), correct ? 600 : 1500);
  };

  return (
    <div>
      <div className="quiz-prompt">
        {recog ? (
          <>
            <div className="headword">{card.word.headword}</div>
            <div className="reading">{card.word.reading}</div>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
              <SpeakButton text={card.word.headword} lang={card.word.lang} />
            </div>
            <p className="muted">意味はどれ?</p>
          </>
        ) : (
          <>
            <div className="meaning">{card.word.meaningJa}</div>
            <p className="muted">{card.word.lang === 'zh' ? '中国語' : 'タイ語'}はどれ?</p>
          </>
        )}
      </div>
      <div className="quiz-options">
        {options.map((o, i) => {
          let cls = '';
          if (picked !== null) {
            if (o.correct) cls = 'correct';
            else if (i === picked) cls = 'wrong';
          }
          return (
            <button key={i} className={cls} onClick={() => pick(i)}>
              {recog ? o.meaningJa : (
                <>
                  {o.headword} <span className="muted">{o.reading}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {picked !== null && !options[picked].correct && (
        <div className="answer-feedback ng">
          正解: {recog ? card.word.meaningJa : `${card.word.headword}(${card.word.reading})`}
        </div>
      )}
    </div>
  );
}
