import { describe, expect, it } from 'vitest';
import type { Word, WordExample } from '../db/schema';
import { buildQuestion, grade, parseForm, posClass } from './caseQuiz';

const word = (headword: string, pos: string, extra: Partial<Word> = {}): Word => ({
  id: 1,
  lang: 'ru',
  headword,
  reading: headword,
  meaningJa: '',
  pos,
  tags: [],
  source: 'reader',
  addedAt: 0,
  repetitions: 0,
  easeFactor: 2.5,
  intervalDays: 0,
  dueAt: 0,
  lapses: 0,
  lastReviewedAt: null,
  stage: 'new',
  ...extra,
});
const ex = (surface: string, form: string, extra: Partial<WordExample> = {}): WordExample => ({
  surface,
  sentence: `… ${surface} …`,
  form,
  at: 1,
  ...extra,
});
const asked = (q: ReturnType<typeof buildQuestion>) => Object.fromEntries((q?.asked ?? []).map((a) => [a.dim, a.answer]));
const excused = (q: ReturnType<typeof buildQuestion>) => (q?.excused ?? []).map((e) => e.dim).sort();

describe('parseForm', () => {
  it('よくある書き方', () => {
    expect(parseForm('過去・女性単数')).toEqual({ tense: 'past', gender: 'f', number: 'sg' });
    expect(parseForm('対格・複数')).toEqual({ case: 'acc', number: 'pl' });
    expect(parseForm('現在・3人称単数')).toEqual({ tense: 'present', person: '3', number: 'sg' });
    expect(parseForm('生格・単数')).toMatchObject({ case: 'gen', number: 'sg' });
  });
  it('最初に出てきた格を採る(「対格(主格と同形)」)', () => {
    expect(parseForm('対格・複数(主格と同形)').case).toBe('acc');
    expect(parseForm('対格・複数(主格と同形)').caseAmbiguous).toBeUndefined();
  });
  it('格が決まっていないもの', () => {
    expect(parseForm('主格または対格・単数').caseAmbiguous).toBe(true);
  });
  it('不変化・短語尾', () => {
    expect(parseForm('不変化(文脈から対格)').indeclinable).toBe(true);
    expect(parseForm('短語尾・女性単数').shortForm).toBe(true);
  });
});

describe('posClass', () => {
  it('品詞の大分類', () => {
    expect(posClass('動詞')).toBe('verb');
    expect(posClass('形動詞')).toBe('adj');
    expect(posClass('副動詞')).toBe('other');
    expect(posClass('名詞')).toBe('noun');
    expect(posClass('前置詞')).toBe('other');
  });
});

describe('buildQuestion', () => {
  it('придумала → 過去・単数・女性(人称は excuse)', () => {
    const q = buildQuestion(word('придумать', '動詞'), ex('придумала', '過去・女性単数'));
    expect(asked(q)).toEqual({ tense: 'past', number: 'sg', gender: 'f' });
    expect(excused(q)).toEqual(['person']);
  });
  it('過去複数は性を excuse', () => {
    const q = buildQuestion(word('придумать', '動詞'), ex('придумали', '過去・複数'));
    expect(asked(q)).toEqual({ tense: 'past', number: 'pl' });
    expect(excused(q)).toEqual(['gender', 'person']);
  });
  it('現在形は人称・数を問い、性は excuse', () => {
    const q = buildQuestion(word('погружать', '動詞'), ex('погружает', '現在・3人称単数'));
    expect(asked(q)).toEqual({ tense: 'present', person: '3', number: 'sg' });
    expect(excused(q)).toEqual(['gender']);
  });
  it('不定形の動詞は出題しない', () => {
    expect(buildQuestion(word('охлаждать', '動詞'), ex('охлаждать', '不定形'))).toBeNull();
  });
  it('名詞の複数は格・数を問い、性は excuse(辞書の性を表示)', () => {
    const q = buildQuestion(word('ячейка', '名詞', { grammar: { gender: '女性' } }), ex('ячейки', '対格・複数'));
    expect(asked(q)).toEqual({ case: 'acc', number: 'pl' });
    expect(q?.excused).toEqual([expect.objectContaining({ dim: 'gender', value: 'f' })]);
  });
  it('名詞の単数は辞書の性も問う', () => {
    const q = buildQuestion(word('система', '名詞', { grammar: { gender: '女性' } }), ex('систему', '対格・単数'));
    expect(asked(q)).toEqual({ case: 'acc', number: 'sg', gender: 'f' });
  });
  it('-ь で終わる名詞の性は excuse', () => {
    const q = buildQuestion(word('жидкость', '名詞', { grammar: { gender: '女性' } }), ex('жидкость', '対格・単数'));
    expect(asked(q)).toEqual({ case: 'acc', number: 'sg' });
    expect(excused(q)).toEqual(['gender']);
  });
  it('形容詞の複数は性を excuse', () => {
    const q = buildQuestion(word('аккумуляторный', '形容詞'), ex('аккумуляторные', '対格・複数'));
    expect(asked(q)).toEqual({ case: 'acc', number: 'pl' });
    expect(excused(q)).toEqual(['gender']);
  });
  it('不変化名詞は格・数を excuse して性だけ問う', () => {
    const q = buildQuestion(word('кофе', '名詞', { grammar: { gender: '男性' } }), ex('кофе', '不変化・対格・単数'));
    expect(asked(q)).toEqual({ gender: 'm' });
    expect(excused(q)).toEqual(['case', 'number']);
  });
  it('構造化タグがあればそちらを優先', () => {
    const q = buildQuestion(
      word('новый', '形容詞'),
      ex('новую', 'よく分からない書き方', { tags: { case: 'acc', number: 'sg', gender: 'f' } }),
    );
    expect(asked(q)).toEqual({ case: 'acc', number: 'sg', gender: 'f' });
  });
  it('構造化タグがあれば説明文からは拾わない', () => {
    const q = buildQuestion(
      word('аккумуляторный', '形容詞'),
      ex('аккумуляторные', '対格・複数(男性・女性・中性の複数形は…)', { tags: { case: 'acc', number: 'pl' } }),
    );
    expect(asked(q)).toEqual({ case: 'acc', number: 'pl' });
    expect(excused(q)).toEqual(['gender']);
  });
  it('前置詞などは出題しない', () => {
    expect(buildQuestion(word('в', '前置詞'), ex('в', '不変化'))).toBeNull();
  });
});

describe('grade', () => {
  it('全部合っていれば正解', () => {
    const q = buildQuestion(word('придумать', '動詞'), ex('придумала', '過去・女性単数'))!;
    expect(grade(q, { tense: 'past', number: 'sg', gender: 'f' }).allOk).toBe(true);
    const r = grade(q, { tense: 'past', number: 'sg', gender: 'm' });
    expect(r.allOk).toBe(false);
    expect(r.perDim.find((d) => d.dim === 'gender')?.ok).toBe(false);
  });
});
