import { describe, expect, it } from 'vitest';
import {
  calculateLookupModalPosition,
  cleanLookupWord,
  createLookupVocabEntry,
  isLookupWordValid
} from './useWordLookup';

describe('word lookup helpers', () => {
  it('cleans punctuation around lookup words while keeping supported scripts', () => {
    expect(cleanLookupWord('"hello,"')).toBe('hello');
    expect(cleanLookupWord('...привет!')).toBe('привет');
    expect(cleanLookupWord('（你好）')).toBe('你好');
  });

  it('rejects empty and overly long lookup words', () => {
    expect(isLookupWordValid('')).toBe(false);
    expect(isLookupWordValid('a'.repeat(21))).toBe(false);
    expect(isLookupWordValid('bonjour')).toBe(true);
  });

  it('keeps the modal inside the right edge of the viewport', () => {
    expect(calculateLookupModalPosition(
      { left: 760, top: 120, bottom: 150 },
      { width: 900, height: 700 }
    )).toEqual({ x: 564, y: 160 });
  });

  it('moves the modal above the word when bottom space is not enough', () => {
    expect(calculateLookupModalPosition(
      { left: 120, top: 560, bottom: 590 },
      { width: 900, height: 700 }
    )).toEqual({ x: 120, y: 250 });
  });

  it('creates the same vocab entry shape as ReaderView used before extraction', () => {
    expect(createLookupVocabEntry({
      word: 'example',
      reading: 'ex-am-ple',
      ipa: '/ɪɡˈzɑːmpəl/',
      cn: '例子',
      ru: 'пример'
    }, 123)).toEqual({
      id: '123',
      word: 'example',
      reading: 'ex-am-ple',
      ipa: '/ɪɡˈzɑːmpəl/',
      meaningCn: '例子',
      meaningRu: 'пример',
      timestamp: 123,
      contextSentence: ''
    });
  });
});
