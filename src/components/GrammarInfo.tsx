import type { Word } from '../db/schema';

/** 「読む」で長押しした単語の文法情報と例文(単語帳・提示カード用) */
export function GrammarInfo({ word, examples = 3 }: { word: Word; examples?: number }) {
  const g = word.grammar;
  const ex = (word.examples ?? []).slice(0, examples);
  if (!g && !ex.length) return null;
  const lang = word.lang;
  return (
    <div className="grammar-info">
      {g?.gender && <div>性: {g.gender}</div>}
      {g?.aspect && (
        <div>
          体: {g.aspect}
          {g.aspectPair && (
            <>
              {' '}
              / ペア <span lang={lang}>{g.aspectPair}</span>
            </>
          )}
        </div>
      )}
      {g?.government && (
        <div>
          支配: <span lang={lang}>{g.government}</span>
        </div>
      )}
      {g?.notes && <div>メモ: {g.notes}</div>}
      {ex.map((e) => (
        <div key={e.at} className="grammar-example">
          <div lang={lang}>{highlight(e.sentence, e.surface)}</div>
          {e.sentenceJa && <div className="muted">{e.sentenceJa}</div>}
          {e.form && (
            <div className="muted">
              <b lang={lang}>{e.surface}</b> = {e.form}
            </div>
          )}
        </div>
      ))}
      {word.lookupCount && word.lookupCount > 1 ? <div className="muted">長押しした回数: {word.lookupCount}</div> : null}
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
