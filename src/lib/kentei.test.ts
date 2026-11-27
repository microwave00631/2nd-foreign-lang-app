import { describe, expect, it } from 'vitest';
import { KENTEI_RU } from '../data/kenteiRu';
import { buildSession, bucketOf, levelProgress, nextRecord, type KenteiRecord } from './kentei';

describe('検定クイズの問題集', () => {
  it('id が一意', () => {
    expect(new Set(KENTEI_RU.map((q) => q.id)).size).toBe(KENTEI_RU.length);
  });
  it.each(KENTEI_RU.map((q) => [q.id, q] as const))('%s の形式が正しい', (_, q) => {
    expect(q.sentence.split('___').length).toBe(2);
    expect(q.options.length).toBeGreaterThanOrEqual(2);
    expect(new Set(q.options).size).toBe(q.options.length);
    expect(q.answer).toBeGreaterThanOrEqual(0);
    expect(q.answer).toBeLessThan(q.options.length);
    expect(q.id.startsWith(`${q.level}-`)).toBe(true);
    expect(q.explain).not.toBe('');
  });
  it('各級に問題がある', () => {
    for (const l of ['4', '3', '2'] as const) expect(KENTEI_RU.filter((q) => q.level === l).length).toBeGreaterThan(20);
  });
});

describe('出題', () => {
  const q0 = KENTEI_RU[0];
  it('連続正解で習得、間違えると要復習に戻る', () => {
    let r = nextRecord(undefined, q0, true, 1);
    expect(bucketOf(r)).toBe(0);
    r = nextRecord(r, q0, true, 2);
    expect(bucketOf(r)).toBe(2);
    r = nextRecord(r, q0, false, 3);
    expect(bucketOf(r)).toBe(0);
    expect(r).toMatchObject({ seen: 3, correct: 2, wrong: 1, streak: 0 });
  });

  it('間違えた問題を優先し、選択肢の正解位置を保つ', () => {
    const wrongIds = KENTEI_RU.filter((q) => q.level === '4').slice(0, 3).map((q) => q.id);
    const recs = new Map<string, KenteiRecord>(
      wrongIds.map((id) => [id, nextRecord(undefined, KENTEI_RU.find((q) => q.id === id)!, false, 1)]),
    );
    const s = buildSession(KENTEI_RU, recs, '4', 10);
    expect(s).toHaveLength(10);
    for (const id of wrongIds) expect(s.map((q) => q.id)).toContain(id);
    for (const q of s) {
      expect(q.level).toBe('4');
      expect(q.shuffled[q.shuffledAnswer]).toBe(q.options[q.answer]);
    }
    expect(buildSession(KENTEI_RU, recs, 'wrong').map((q) => q.id).sort()).toEqual([...wrongIds].sort());
    expect(levelProgress(KENTEI_RU, recs, '4')).toMatchObject({ total: 30, mastered: 0, review: 3 });
  });
});

import { ASPECT_RU, ASPECT_RULES } from '../data/aspectRu';
import { ruleStats, weakRules } from './kentei';

describe('体トレーニング', () => {
  it('問題の形式とルールが正しい', () => {
    const keys = new Set(ASPECT_RULES.map((r) => r.key));
    expect(new Set([...KENTEI_RU, ...ASPECT_RU].map((q) => q.id)).size).toBe(KENTEI_RU.length + ASPECT_RU.length);
    for (const q of ASPECT_RU) {
      expect(keys.has(q.rule!)).toBe(true);
      expect(q.options).toHaveLength(2);
      expect(q.sentence.split('___').length).toBe(2);
      const rule = ASPECT_RULES.find((r) => r.key === q.rule)!;
      // ルールが指す体と正解の体が食い違っていないこと
      if (rule.aspect !== 'mixed') expect(q.answer).toBe(rule.aspect === 'impf' ? 0 : 1);
    }
    for (const r of ASPECT_RULES) expect(ASPECT_RU.some((q) => q.rule === r.key)).toBe(true);
  });

  it('間違えたルールが苦手に入る', () => {
    const q = ASPECT_RU[0];
    const recs = new Map<string, KenteiRecord>([[q.id, nextRecord(undefined, q, false, 1)]]);
    const stats = ruleStats(ASPECT_RU, recs);
    expect(stats.get(q.rule!)).toMatchObject({ wrong: 1, review: 1 });
    expect(weakRules(stats)).toEqual([q.rule]);
  });
});
