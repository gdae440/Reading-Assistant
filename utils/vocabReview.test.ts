import { describe, expect, it } from 'vitest';
import { WordEntry } from '../types';
import {
  applyReviewResult,
  getReviewQueue,
  isActiveWrongWord,
  isDueToday,
  normalizeReviewStats,
  normalizeVocabEntry,
  normalizeWordKey,
  setFamiliarity
} from './vocabReview';

const baseTime = new Date('2026-04-30T10:00:00Z').getTime();
const day = 24 * 60 * 60 * 1000;

const word = (overrides: Partial<WordEntry> = {}): WordEntry => ({
  id: overrides.id || 'word-1',
  word: overrides.word || 'Example',
  ipa: '',
  meaningCn: '例子',
  meaningRu: '',
  timestamp: baseTime - day,
  ...overrides
});

describe('vocab review helpers', () => {
  it('normalizes legacy entries without changing user-facing fields', () => {
    const entry = word({ word: ' Test! ' });
    const normalized = normalizeVocabEntry(entry);

    expect(normalized.word).toBe(' Test! ');
    expect(normalized.familiarity).toBe('new');
    expect(normalized.reviewStats).toEqual({
      schedulerVersion: 'fsrs-lite-v1',
      dueAt: entry.timestamp,
      reviewCount: 0,
      correctCount: 0,
      wrongCount: 0,
      lapseCount: 0,
      difficulty: 5,
      stability: 0,
      retrievability: 0
    });
  });

  it('normalizes word keys for saved-word matching', () => {
    expect(normalizeWordKey('Hello,')).toBe('hello');
    expect(normalizeWordKey('  Привет! ')).toBe('привет');
    expect(normalizeWordKey('音楽。')).toBe('音楽');
  });

  it('excludes mastered words from today review', () => {
    const entry = word({
      familiarity: 'mastered',
      reviewStats: {
            dueAt: baseTime - day,
            reviewCount: 2,
            correctCount: 2,
            wrongCount: 0,
            lapseCount: 0,
            difficulty: 4,
            stability: 14,
            retrievability: 0.9
      }
    });

    expect(isDueToday(entry, baseTime)).toBe(false);
  });

  it('sorts due review queue with wrong words first, then older due dates', () => {
    const queue = getReviewQueue(
      [
        word({
          id: 'normal-old',
          timestamp: baseTime - 4 * day,
          reviewStats: {
            dueAt: baseTime - 3 * day,
            reviewCount: 1,
            correctCount: 1,
            wrongCount: 0,
            lapseCount: 0,
            difficulty: 5,
            stability: 3,
            retrievability: 0.9
          }
        }),
        word({
          id: 'wrong-later',
          timestamp: baseTime - day,
          reviewStats: {
            dueAt: baseTime - day,
            reviewCount: 2,
            correctCount: 1,
            wrongCount: 2,
            lapseCount: 2,
            difficulty: 7,
            stability: 0.5,
            retrievability: 0.4
          }
        }),
        word({
          id: 'normal-newer',
          timestamp: baseTime - day,
          reviewStats: {
            dueAt: baseTime - 2 * day,
            reviewCount: 1,
            correctCount: 1,
            wrongCount: 0,
            lapseCount: 0,
            difficulty: 5,
            stability: 3,
            retrievability: 0.9
          }
        })
      ],
      baseTime
    );

    expect(queue.map(entry => entry.id)).toEqual(['wrong-later', 'normal-old', 'normal-newer']);
  });

  it('moves new words to known after a correct review', () => {
    const result = applyReviewResult(word(), 'good', baseTime);
    const stats = normalizeReviewStats(result);

    expect(result.familiarity).toBe('known');
    expect(stats.reviewCount).toBe(1);
    expect(stats.correctCount).toBe(1);
    expect(stats.wrongCount).toBe(0);
    expect(stats.lapseCount).toBe(0);
    expect(stats.dueAt).toBe(baseTime + 3 * day);
    expect(stats.lastReviewedAt).toBe(baseTime);
    expect(stats.stability).toBe(3);
    expect(stats.difficulty).toBeCloseTo(4.85);
    expect(result.reviewLog?.[0]).toMatchObject({
      schedulerVersion: 'fsrs-lite-v1',
      rating: 'good',
      reviewedAt: baseTime,
      scheduledDays: 3,
      stabilityAfter: 3
    });
  });

  it('keeps known words in review rotation after a normal correct review', () => {
    const result = applyReviewResult(
      word({
        familiarity: 'known',
        reviewStats: {
          dueAt: baseTime - day,
          reviewCount: 1,
          correctCount: 1,
          wrongCount: 0,
          lapseCount: 0,
          difficulty: 5,
          stability: 3,
          retrievability: 0.9,
          lastReviewedAt: baseTime - 3 * day
        }
      }),
      'good',
      baseTime
    );

    expect(result.familiarity).toBe('known');
    expect(normalizeReviewStats(result).stability).toBeGreaterThan(3);
  });

  it('supports hard reviews as a recalled but difficult answer', () => {
    const result = applyReviewResult(word(), 'hard', baseTime);
    const stats = normalizeReviewStats(result);

    expect(result.familiarity).toBe('known');
    expect(stats.correctCount).toBe(1);
    expect(stats.wrongCount).toBe(0);
    expect(stats.stability).toBe(1);
    expect(stats.dueAt).toBe(baseTime + day);
    expect(result.reviewLog?.[0].rating).toBe('hard');
  });

  it('marks wrong words as new and keeps them active for review', () => {
    const result = applyReviewResult(
      word({
        familiarity: 'known',
        reviewStats: {
          dueAt: baseTime - day,
          reviewCount: 3,
          correctCount: 2,
          wrongCount: 1,
          lapseCount: 1,
          difficulty: 6,
          stability: 4,
          retrievability: 0.8
        }
      }),
      'again',
      baseTime
    );
    const stats = normalizeReviewStats(result);

    expect(result.familiarity).toBe('new');
    expect(stats.reviewCount).toBe(4);
    expect(stats.correctCount).toBe(2);
    expect(stats.wrongCount).toBe(2);
    expect(stats.lapseCount).toBe(2);
    expect(stats.dueAt).toBe(baseTime);
    expect(stats.stability).toBeCloseTo(1.8);
    expect(isActiveWrongWord(result)).toBe(true);
    expect(result.reviewLog?.at(-1)).toMatchObject({
      rating: 'again',
      scheduledDays: 0
    });
  });

  it('lets the user mark a reviewed word as mastered', () => {
    const result = applyReviewResult(word(), 'easy', baseTime);
    const stats = normalizeReviewStats(result);

    expect(result.familiarity).toBe('mastered');
    expect(stats.stability).toBe(14);
    expect(stats.dueAt).toBe(baseTime + 14 * day);
  });

  it('supports manual familiarity changes', () => {
    const mastered = setFamiliarity(word(), 'mastered', baseTime);
    const known = setFamiliarity(mastered, 'known', baseTime);

    expect(mastered.familiarity).toBe('mastered');
    expect(normalizeReviewStats(mastered).dueAt).toBe(baseTime + 14 * day);
    expect(known.familiarity).toBe('known');
    expect(normalizeReviewStats(known).dueAt).toBe(baseTime);
  });
});
