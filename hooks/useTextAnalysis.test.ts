import { describe, expect, it } from 'vitest';
import { createAnalysisVocabEntry, createTextHistoryEntry } from './useTextAnalysis';

describe('text analysis helpers', () => {
  it('creates translation history entries with the expected persisted shape', () => {
    expect(createTextHistoryEntry('hello', '你好', 'translation', 123)).toEqual({
      id: '123',
      original: 'hello',
      translation: '你好',
      type: 'translation',
      timestamp: 123
    });
  });

  it('creates reply history entries with the expected persisted shape', () => {
    expect(createTextHistoryEntry('Как дела?', 'Все хорошо.', 'reply', 456)).toEqual({
      id: '456',
      original: 'Как дела?',
      translation: 'Все хорошо.',
      type: 'reply',
      timestamp: 456
    });
  });

  it('creates vocabulary entries from analysis items without adding new fields', () => {
    expect(createAnalysisVocabEntry({ text: 'take off', cn: '起飞；脱下' }, 789)).toEqual({
      id: '789',
      word: 'take off',
      meaningCn: '起飞；脱下',
      meaningRu: '',
      timestamp: 789
    });
  });
});
