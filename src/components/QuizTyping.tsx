import { useState, type FormEvent } from 'react';
import type { QuizCard } from '../lib/quiz';
import { checkTypingAnswer } from '../lib/answer';
import { useSettings } from '../context/SettingsContext';
import { SpeakButton } from './SpeakButton';

interface Props {
  card: QuizCard;
  onAnswer: (correct: boolean) => void;
}

/** タイピング: 日本語の意味 → 読み(または原語表記)を入力 */
export function QuizTyping({ card, onAnswer }: Props) {
  const { settings } = useSettings();
  const [value, setValue] = useState('');
  const [result, setResult] = useState<null | boolean>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (result !== null) return;
    const ok = checkTypingAnswer(card.word.lang, value, card.word.headword, card.word.reading, {
      toneStrict: settings.typingToneStrict,
    });
    setResult(ok);
    setTimeout(() => onAnswer(ok), ok ? 700 : 2200);
  };

  const placeholder =
    card.word.lang === 'zh' ? 'ピンイン(声調は任意)または漢字' : 'ローマ字またはタイ文字';

  return (
    <div>
      <div className="quiz-prompt">
        <div className="meaning">{card.word.meaningJa}</div>
        <p className="muted">{card.word.lang === 'zh' ? '中国語' : 'タイ語'}で入力してください</p>
      </div>
      <form onSubmit={submit}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          disabled={result !== null}
        />
        <button className="btn-primary" style={{ marginTop: 12 }} disabled={result !== null}>
          答える
        </button>
      </form>
      {result === true && <div className="answer-feedback ok">⭕ 正解!</div>}
      {result === false && (
        <div className="answer-feedback ng">
          ❌ 正解: {card.word.headword}({card.word.reading})
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
            <SpeakButton text={card.word.headword} lang={card.word.lang} />
          </div>
        </div>
      )}
    </div>
  );
}
