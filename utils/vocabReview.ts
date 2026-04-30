import { VocabFamiliarity, VocabReviewRating, VocabReviewStats, WordEntry } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
export const VOCAB_SCHEDULER_VERSION = 'fsrs-lite-v1';
const FSRS_DECAY = -0.5;
const FSRS_FACTOR = Math.pow(0.9, 1 / FSRS_DECAY) - 1;

const INITIAL_STABILITY = {
  again: 0.5,
  hard: 1,
  good: 3,
  easy: 14
};

const INITIAL_DIFFICULTY = {
  again: 7,
  hard: 6,
  good: 5,
  easy: 4
};

export const normalizeWordKey = (value: string) =>
  value
    .trim()
    .replace(/^[^\w\u0400-\u04FF\u4e00-\u9fa5\u3040-\u30ff\u3400-\u4dbf]+|[^\w\u0400-\u04FF\u4e00-\u9fa5\u3040-\u30ff\u3400-\u4dbf]+$/g, '')
    .toLowerCase();

export const familiarityLabel: Record<VocabFamiliarity, string> = {
  new: '新词',
  known: '认识',
  mastered: '掌握'
};

export const familiarityBadgeClass: Record<VocabFamiliarity, string> = {
  new: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  known: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
  mastered: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
};

export const normalizeFamiliarity = (entry: WordEntry): VocabFamiliarity =>
  entry.familiarity || 'new';

export const defaultReviewStats = (timestamp: number): VocabReviewStats => ({
  schedulerVersion: VOCAB_SCHEDULER_VERSION,
  dueAt: timestamp,
  reviewCount: 0,
  correctCount: 0,
  wrongCount: 0,
  lapseCount: 0,
  difficulty: 5,
  stability: 0,
  retrievability: 0
});

export const normalizeReviewStats = (entry: WordEntry): VocabReviewStats => ({
  ...defaultReviewStats(entry.timestamp),
  ...entry.reviewStats
});

export const normalizeVocabEntry = (entry: WordEntry): WordEntry => ({
  ...entry,
  familiarity: normalizeFamiliarity(entry),
  reviewStats: normalizeReviewStats(entry)
});

export const endOfToday = (now = Date.now()) => {
  const date = new Date(now);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

export const isDueToday = (entry: WordEntry, now = Date.now()) => {
  const familiarity = normalizeFamiliarity(entry);
  const stats = normalizeReviewStats(entry);
  return familiarity !== 'mastered' && stats.dueAt <= endOfToday(now);
};

export const isActiveWrongWord = (entry: WordEntry) => {
  const stats = normalizeReviewStats(entry);
  return normalizeFamiliarity(entry) !== 'mastered' && stats.wrongCount > 0;
};

export const getReviewQueue = (entries: WordEntry[], now = Date.now()) =>
  entries
    .filter(entry => isDueToday(entry, now))
    .map(normalizeVocabEntry)
    .sort((a, b) => {
      const aStats = normalizeReviewStats(a);
      const bStats = normalizeReviewStats(b);
      return (
        bStats.wrongCount - aStats.wrongCount ||
        aStats.dueAt - bStats.dueAt ||
        a.timestamp - b.timestamp
      );
    });

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const elapsedDays = (stats: VocabReviewStats, now: number) => {
  if (!stats.lastReviewedAt) return 0;
  return Math.max(0, (now - stats.lastReviewedAt) / DAY_MS);
};

export const computeRetrievability = (stats: VocabReviewStats, now = Date.now()) => {
  if (!stats.lastReviewedAt || stats.stability <= 0) return stats.reviewCount > 0 ? 1 : 0;
  return clamp(
    Math.pow(1 + FSRS_FACTOR * elapsedDays(stats, now) / Math.max(0.1, stats.stability), FSRS_DECAY),
    0,
    1
  );
};

const dueAtFromStability = (stability: number, now: number) => {
  const days = Math.max(1, Math.round(stability));
  return now + days * DAY_MS;
};

const updateDifficulty = (difficulty: number, rating: VocabReviewRating) => {
  if (rating === 'again') return clamp(difficulty + 1.1, 1, 10);
  if (rating === 'hard') return clamp(difficulty + 0.4, 1, 10);
  if (rating === 'easy') return clamp(difficulty - 0.6, 1, 10);
  return clamp(difficulty - 0.15, 1, 10);
};

const updateStability = (
  stats: VocabReviewStats,
  rating: VocabReviewRating,
  now: number
) => {
  if (stats.reviewCount === 0 || stats.stability <= 0) {
    return INITIAL_STABILITY[rating];
  }

  const retrievability = computeRetrievability(stats, now);
  const memoryHeadroom = Math.max(1, 11 - stats.difficulty);

  if (rating === 'again') {
    return Math.max(0.5, stats.stability * 0.45);
  }

  if (rating === 'hard') {
    const hardGrowth = 1 + (1 - retrievability) * memoryHeadroom * 0.18;
    return Math.max(stats.stability + 0.5, stats.stability * clamp(hardGrowth, 1.05, 1.6));
  }

  const baseGrowth = rating === 'easy' ? 0.7 : 0.45;
  const bonus = rating === 'easy' ? 0.6 : 0;
  const growth = 1 + (1 - retrievability) * memoryHeadroom * baseGrowth + bonus;
  const boundedGrowth = rating === 'easy'
    ? clamp(growth, 2, 5)
    : clamp(growth, 1.2, 3.5);

  return Math.max(stats.stability + 1, stats.stability * boundedGrowth);
};

const familiarityAfterReview = (
  current: VocabFamiliarity,
  rating: VocabReviewRating
): VocabFamiliarity => {
  if (rating === 'again') return 'new';
  if (rating === 'easy') return 'mastered';
  if (current === 'new') return 'known';
  return current;
};

export const applyReviewResult = (
  entry: WordEntry,
  rating: VocabReviewRating,
  now = Date.now()
): WordEntry => {
  const stats = normalizeReviewStats(entry);
  const retrievabilityBefore = computeRetrievability(stats, now);
  const difficultyBefore = stats.reviewCount === 0 ? INITIAL_DIFFICULTY[rating] : stats.difficulty;
  const stabilityBefore = stats.stability;
  const difficulty = updateDifficulty(
    difficultyBefore,
    rating
  );
  const stability = updateStability(stats, rating, now);
  const familiarity = familiarityAfterReview(normalizeFamiliarity(entry), rating);
  const dueAt = rating === 'again' ? now : dueAtFromStability(stability, now);
  const scheduledDays = Math.max(0, Math.round((dueAt - now) / DAY_MS));

  return {
    ...entry,
    familiarity,
    reviewStats: {
      schedulerVersion: VOCAB_SCHEDULER_VERSION,
      dueAt,
      lastReviewedAt: now,
      reviewCount: stats.reviewCount + 1,
      correctCount: stats.correctCount + (rating === 'again' ? 0 : 1),
      wrongCount: stats.wrongCount + (rating === 'again' ? 1 : 0),
      lapseCount: stats.lapseCount + (rating === 'again' ? 1 : 0),
      difficulty,
      stability,
      retrievability: 1
    },
    reviewLog: [
      ...(entry.reviewLog || []),
      {
        schedulerVersion: VOCAB_SCHEDULER_VERSION,
        reviewedAt: now,
        rating,
        elapsedDays: elapsedDays(stats, now),
        scheduledDays,
        retrievabilityBefore,
        difficultyBefore,
        stabilityBefore,
        difficultyAfter: difficulty,
        stabilityAfter: stability,
        dueAt
      }
    ]
  };
};

export const setFamiliarity = (
  entry: WordEntry,
  familiarity: VocabFamiliarity,
  now = Date.now()
): WordEntry => {
  const stats = normalizeReviewStats(entry);
  return {
    ...entry,
    familiarity,
    reviewStats: {
      ...stats,
      dueAt: familiarity === 'mastered' ? dueAtFromStability(Math.max(stats.stability, 14), now) : Math.min(stats.dueAt, now),
      stability: familiarity === 'mastered' ? Math.max(stats.stability, 14) : stats.stability,
      retrievability: familiarity === 'mastered' ? 1 : computeRetrievability(stats, now)
    }
  };
};
