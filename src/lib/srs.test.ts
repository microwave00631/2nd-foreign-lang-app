import { describe, expect, it } from 'vitest';
import { applyReview, computeStage, gradeAnswer, INITIAL_SRS, type SrsState } from './srs';
import { DAY_MS, startOfLocalDay } from './time';

const NOW = new Date('2026-06-11T12:00:00').getTime();

describe('applyReview (SM-2)', () => {
  it('初回正解で interval=1日', () => {
    const s = applyReview(INITIAL_SRS, 5, NOW);
    expect(s.repetitions).toBe(1);
    expect(s.intervalDays).toBe(1);
    expect(s.dueAt).toBe(startOfLocalDay(NOW) + DAY_MS);
    expect(s.stage).toBe('learning');
  });

  it('2回目正解で interval=6日', () => {
    const s1 = applyReview(INITIAL_SRS, 5, NOW);
    const s2 = applyReview(s1, 5, NOW + DAY_MS);
    expect(s2.repetitions).toBe(2);
    expect(s2.intervalDays).toBe(6);
  });

  it('3回目以降は interval × EF', () => {
    let s: SrsState = INITIAL_SRS;
    s = applyReview(s, 5, NOW);
    s = applyReview(s, 5, NOW);
    const ef = s.easeFactor;
    const s3 = applyReview(s, 5, NOW);
    expect(s3.intervalDays).toBe(Math.round(6 * ef));
  });

  it('quality<3 でリセット+lapses増加', () => {
    let s: SrsState = INITIAL_SRS;
    s = applyReview(s, 5, NOW);
    s = applyReview(s, 5, NOW);
    const failed = applyReview(s, 2, NOW);
    expect(failed.repetitions).toBe(0);
    expect(failed.intervalDays).toBe(1);
    expect(failed.lapses).toBe(1);
    expect(failed.stage).toBe('learning');
  });

  it('EF は 1.3 を下回らない', () => {
    let s: SrsState = { ...INITIAL_SRS, easeFactor: 1.3 };
    for (let i = 0; i < 10; i++) s = applyReview(s, 3, NOW);
    expect(s.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('quality=5 で EF 上昇', () => {
    const s = applyReview(INITIAL_SRS, 5, NOW);
    expect(s.easeFactor).toBeCloseTo(2.6, 5);
  });
});

describe('computeStage', () => {
  it('未学習は new', () => {
    expect(computeStage(INITIAL_SRS)).toBe('new');
  });
  it('interval 7〜20日 は review', () => {
    expect(computeStage({ repetitions: 3, lastReviewedAt: NOW, intervalDays: 10, easeFactor: 2.5 })).toBe('review');
  });
  it('interval 21日以上かつ EF>=2.3 で mastered', () => {
    expect(computeStage({ repetitions: 4, lastReviewedAt: NOW, intervalDays: 25, easeFactor: 2.5 })).toBe('mastered');
  });
  it('interval 21日以上でも EF<2.3 は review', () => {
    expect(computeStage({ repetitions: 4, lastReviewedAt: NOW, intervalDays: 25, easeFactor: 2.0 })).toBe('review');
  });
});

describe('gradeAnswer', () => {
  it('不正解は 2', () => {
    expect(gradeAnswer('typing', false, 1000)).toBe(2);
  });
  it('タイピング正解は 5', () => {
    expect(gradeAnswer('typing', true, 10_000)).toBe(5);
  });
  it('選択式正解 6秒未満は 4、以上は 3', () => {
    expect(gradeAnswer('mc-recog', true, 3000)).toBe(4);
    expect(gradeAnswer('mc-recall', true, 8000)).toBe(3);
  });
});
