// SM-2 間隔反復エンジン(純関数)。DOM・DB非依存。
import type { Stage } from '../db/schema';
import { DAY_MS, startOfLocalDay } from './time';

export interface SrsState {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  dueAt: number;
  lapses: number;
  lastReviewedAt: number | null;
  stage: Stage;
}

export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

export const INITIAL_SRS: SrsState = {
  repetitions: 0,
  easeFactor: 2.5,
  intervalDays: 0,
  dueAt: 0,
  lapses: 0,
  lastReviewedAt: null,
  stage: 'new',
};

export function computeStage(s: Pick<SrsState, 'repetitions' | 'lastReviewedAt' | 'intervalDays' | 'easeFactor'>): Stage {
  if (s.lastReviewedAt === null && s.repetitions === 0) return 'new';
  if (s.intervalDays < 7) return 'learning';
  if (s.intervalDays < 21) return 'review';
  return s.easeFactor >= 2.3 ? 'mastered' : 'review';
}

/** SM-2 を1回分適用した新しい状態を返す */
export function applyReview(state: SrsState, quality: Quality, now: number): SrsState {
  let { repetitions, easeFactor, intervalDays, lapses } = state;

  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
    lapses += 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * easeFactor);
    easeFactor = Math.max(
      1.3,
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
    );
  }

  const next: SrsState = {
    repetitions,
    easeFactor,
    intervalDays,
    lapses,
    dueAt: startOfLocalDay(now) + intervalDays * DAY_MS,
    lastReviewedAt: now,
    stage: 'learning',
  };
  next.stage = computeStage(next);
  return next;
}

/** クイズ結果から SM-2 quality への自動採点 */
export function gradeAnswer(
  quizType: 'mc-recog' | 'mc-recall' | 'typing',
  correct: boolean,
  responseMs: number,
): Quality {
  if (!correct) return 2;
  if (quizType === 'typing') return 5;
  return responseMs < 6000 ? 4 : 3;
}
