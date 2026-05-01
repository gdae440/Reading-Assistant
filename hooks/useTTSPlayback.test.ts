import { describe, expect, it } from 'vitest';
import {
  browserLangMatches,
  buildEstimatedSentenceTimeline,
  buildPlaybackFromSentenceIndex,
  buildPlaybackSentences,
  buildPlaybackTextFromSentences,
  estimatedSentenceRatioRange,
  sentenceIndexAtPlaybackTime,
  selectTTSPlaybackText,
  shouldUseSentenceLevelPlayback
} from './useTTSPlayback';

describe('selectTTSPlaybackText', () => {
  it('plays the full text in all mode', () => {
    expect(selectTTSPlaybackText('Hello world.', 'all', { start: 0, end: 0 })).toEqual({
      textToPlay: 'Hello world.',
      fallbackToAll: false
    });
  });

  it('plays the selected text when the selection contains meaningful characters', () => {
    expect(selectTTSPlaybackText('One. Two. Three.', 'select', { start: 5, end: 9 })).toEqual({
      textToPlay: 'Two.',
      fallbackToAll: false
    });
  });

  it('plays from the cursor in continue mode', () => {
    expect(selectTTSPlaybackText('One. Two. Three.', 'continue', { start: 5, end: 5 })).toEqual({
      textToPlay: 'Two. Three.',
      fallbackToAll: false
    });
  });

  it('falls back to full text when the selected segment is only punctuation', () => {
    expect(selectTTSPlaybackText('Hello, world.', 'select', { start: 5, end: 6 })).toEqual({
      textToPlay: 'Hello, world.',
      fallbackToAll: true
    });
  });
});

describe('browserLangMatches', () => {
  it('matches primary supported languages without selecting Cantonese or Traditional Chinese for zh', () => {
    expect(browserLangMatches('en-US', 'en')).toBe(true);
    expect(browserLangMatches('ru-RU', 'ru')).toBe(true);
    expect(browserLangMatches('ja-JP', 'ja')).toBe(true);
    expect(browserLangMatches('zh-CN', 'zh')).toBe(true);
    expect(browserLangMatches('zh-TW', 'zh')).toBe(false);
  });
});

describe('buildPlaybackSentences', () => {
  it('creates trimmed sentence items for playback progress', () => {
    expect(buildPlaybackSentences('One. Two!\nThree?')).toEqual([
      { text: 'One.' },
      { text: 'Two!' },
      { text: 'Three?' }
    ]);
  });

  it('omits empty whitespace-only segments', () => {
    expect(buildPlaybackSentences('\n\n')).toEqual([]);
  });

  it('omits divider-only segments from playback progress', () => {
    expect(buildPlaybackSentences('Start small.\n---\nWould you like it?')).toEqual([
      { text: 'Start small.' },
      { text: 'Would you like it?' }
    ]);
  });
});

describe('buildPlaybackFromSentenceIndex', () => {
  it('returns the text and original indexes from the selected sentence to the end', () => {
    expect(buildPlaybackFromSentenceIndex('One. Two. Three.', 1)).toEqual({
      allSentences: [
        { text: 'One.', originalIndex: 0 },
        { text: 'Two.', originalIndex: 1 },
        { text: 'Three.', originalIndex: 2 }
      ],
      sentences: [
        { text: 'Two.', originalIndex: 1 },
        { text: 'Three.', originalIndex: 2 }
      ],
      textToPlay: 'Two. Three.'
    });
  });

  it('clamps out-of-range start indexes', () => {
    expect(buildPlaybackFromSentenceIndex('One. Two.', -5).textToPlay).toBe('One. Two.');
    expect(buildPlaybackFromSentenceIndex('One. Two.', 8).textToPlay).toBe('');
  });
});

describe('buildPlaybackTextFromSentences', () => {
  it('joins sentence text for one-shot API playback', () => {
    expect(buildPlaybackTextFromSentences([{ text: 'One.' }, { text: 'Two.' }])).toBe('One. Two.');
  });
});

describe('shouldUseSentenceLevelPlayback', () => {
  it('uses sentence-level playback only for browser TTS or shadowing mode', () => {
    expect(shouldUseSentenceLevelPlayback('browser', false)).toBe(true);
    expect(shouldUseSentenceLevelPlayback('edge', false)).toBe(false);
    expect(shouldUseSentenceLevelPlayback('azure', false)).toBe(false);
    expect(shouldUseSentenceLevelPlayback('siliconflow', false)).toBe(false);
    expect(shouldUseSentenceLevelPlayback('edge', true)).toBe(true);
  });
});

describe('estimated sentence timeline', () => {
  it('builds duration ratios weighted by sentence text length', () => {
    const timeline = buildEstimatedSentenceTimeline([
      { text: 'Hi.', originalIndex: 2 },
      { text: 'Longer sentence.', originalIndex: 3 }
    ]);

    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({
      sentence: { text: 'Hi.', originalIndex: 2 },
      startRatio: 0
    });
    expect(timeline[0].endRatio).toBeCloseTo(3 / 19);
    expect(timeline[1]).toMatchObject({
      sentence: { text: 'Longer sentence.', originalIndex: 3 },
      endRatio: 1
    });
  });

  it('maps audio playback time to the estimated original sentence index', () => {
    const timeline = buildEstimatedSentenceTimeline([
      { text: 'Short.', originalIndex: 4 },
      { text: 'Another short one.', originalIndex: 5 },
      { text: 'Final.', originalIndex: 6 }
    ]);

    expect(sentenceIndexAtPlaybackTime(timeline, 0, 30)).toBe(4);
    expect(sentenceIndexAtPlaybackTime(timeline, 12, 30)).toBe(5);
    expect(sentenceIndexAtPlaybackTime(timeline, 30, 30)).toBe(6);
  });

  it('returns null when playback timing is not usable', () => {
    const timeline = buildEstimatedSentenceTimeline([{ text: 'Hello.', originalIndex: 0 }]);

    expect(sentenceIndexAtPlaybackTime(timeline, 1, 0)).toBeNull();
    expect(sentenceIndexAtPlaybackTime([], 1, 10)).toBeNull();
    expect(sentenceIndexAtPlaybackTime(timeline, Number.NaN, 10)).toBeNull();
  });

  it('finds the estimated ratio range for a source sentence', () => {
    const timeline = buildEstimatedSentenceTimeline([
      { text: 'One.', originalIndex: 0 },
      { text: 'Two two.', originalIndex: 1 }
    ]);

    expect(estimatedSentenceRatioRange(timeline, 1)).toEqual({
      startRatio: 4 / 12,
      endRatio: 1
    });
    expect(estimatedSentenceRatioRange(timeline, 9)).toBeNull();
  });
});
