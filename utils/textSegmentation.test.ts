import { describe, expect, it } from 'vitest';
import { splitBrowserSpeechSegments, splitTextIntoSentences } from './textSegmentation';

describe('text segmentation helpers', () => {
  it('splits multilingual text while keeping sentence punctuation', () => {
    expect(splitTextIntoSentences('Hello world. 你好！Еще тест?\nNext line')).toEqual([
      'Hello world.',
      ' 你好！',
      'Еще тест?\n',
      'Next line'
    ]);
  });

  it('keeps text without sentence punctuation as one segment', () => {
    expect(splitTextIntoSentences('plain text without punctuation')).toEqual(['plain text without punctuation']);
  });

  it('returns original whitespace-only text when there is no speakable segment', () => {
    expect(splitBrowserSpeechSegments('   ')).toEqual(['   ']);
  });

  it('splits long browser speech sentences into shorter chunks', () => {
    const longSentence = `${'a'.repeat(181)}.`;
    const segments = splitBrowserSpeechSegments(longSentence);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toHaveLength(160);
    expect(segments[1]).toHaveLength(22);
  });
});
