import { describe, expect, it } from 'vitest';
import { sentenceAt, tokenize } from './reader';
import { normalizeRu } from './langs';
import { checkTypingAnswer } from './answer';

const TITLE = 'BYD погружает аккумуляторные ячейки в жидкость: компания придумала новую систему охлаждения';

describe('tokenize', () => {
  it('連結すると元の文字列に戻り、キリル文字の語だけが長押し対象', () => {
    const toks = tokenize(TITLE);
    expect(toks.map((t) => t.text).join('')).toBe(TITLE);
    const words = toks.filter((t) => t.word).map((t) => t.text);
    expect(words).toEqual(['погружает', 'аккумуляторные', 'ячейки', 'в', 'жидкость', 'компания', 'придумала', 'новую', 'систему', 'охлаждения']);
    expect(toks.find((t) => t.text === 'BYD')?.word).toBe(false);
  });
  it('ハイフン語・数字', () => {
    const toks = tokenize('Какой-то 2026 год');
    expect(toks.filter((t) => t.word).map((t) => t.text)).toEqual(['Какой-то', 'год']);
  });
});

describe('sentenceAt', () => {
  const p = 'Документ опубликован 5 октября. Заявка была подана ещё в марте 2025 года. Конструкция предусматривает корпус.';
  it('単語を含む1文を返す', () => {
    expect(sentenceAt(p, p.indexOf('подана'))).toBe('Заявка была подана ещё в марте 2025 года.');
    expect(sentenceAt(p, 0)).toBe('Документ опубликован 5 октября.');
    expect(sentenceAt(p, p.indexOf('корпус'))).toBe('Конструкция предусматривает корпус.');
  });
  it('長すぎる文は前後を詰める', () => {
    const long = 'слово '.repeat(300);
    expect(sentenceAt(long, 900, 100).length).toBeLessThanOrEqual(102);
  });
});

describe('ロシア語の正規化と回答判定', () => {
  it('アクセント記号・ё・大文字を無視', () => {
    expect(normalizeRu('погружа́ть')).toBe('погружать');
    expect(normalizeRu('Ещё')).toBe('еще');
  });
  it('辞書形で正解', () => {
    expect(checkTypingAnswer('ru', 'ячейка', 'ячейка', 'яче́йка')).toBe(true);
    expect(checkTypingAnswer('ru', 'яче́йка', 'ячейка', 'яче́йка')).toBe(true);
    expect(checkTypingAnswer('ru', 'ячейки', 'ячейка', 'яче́йка')).toBe(false);
  });
});
