import type { Word } from '../db/schema';
import { SpeakButton } from './SpeakButton';
import { GrammarInfo } from './GrammarInfo';

export function PresentCard({ word, onNext }: { word: Word; onNext: () => void }) {
  return (
    <div className="card present-card">
      <div className="badge">新しい単語</div>
      <div className="quiz-prompt">
        <div className="headword">{word.headword}</div>
        <div className="reading">{word.reading}</div>
        <div style={{ marginTop: 12, fontSize: '1.2rem' }}>{word.meaningJa}</div>
        {word.pos && <div className="muted" style={{ marginTop: 4 }}>{word.pos}</div>}
      </div>
      {(word.grammar || word.examples?.length) && (
        <div className="present-grammar">
          <GrammarInfo word={word} examples={1} />
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <SpeakButton text={word.headword} lang={word.lang} />
      </div>
      <button className="btn-primary" onClick={onNext}>
        覚えた!クイズへ
      </button>
    </div>
  );
}
