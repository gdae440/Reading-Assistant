import { describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../types';
import { buildTTSCacheKey, saveLimitedAudioUrl } from './ttsCache';

const settings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  apiKey: '',
  llmModel: 'deepseek-ai/DeepSeek-V3.2',
  visionModel: 'Qwen/Qwen3-VL-32B-Instruct',
  ttsProvider: 'edge',
  ttsSpeed: 1,
  shadowingMode: false,
  shadowingPause: 2,
  sfTtsModel: 'FunAudioLLM/CosyVoice2-0.5B',
  sfTtsVoice: 'FunAudioLLM/CosyVoice2-0.5B:bella',
  azureKey: '',
  azureRegion: 'westcentralus',
  azureVoice: 'en-US-AvaMultilingualNeural',
  browserVoice: '',
  edgeVoice: 'en-US-AvaMultilingualNeural',
  ...overrides
});

describe('TTS cache helpers', () => {
  it('includes provider-specific voice settings in the cache key', () => {
    const edgeKey = buildTTSCacheKey('hello', settings({ ttsProvider: 'edge', edgeVoice: 'en-US-AvaMultilingualNeural' }));
    const otherEdgeVoiceKey = buildTTSCacheKey('hello', settings({ ttsProvider: 'edge', edgeVoice: 'en-GB-RyanNeural' }));
    const azureKey = buildTTSCacheKey('hello', settings({ ttsProvider: 'azure', azureVoice: 'en-US-AvaMultilingualNeural' }));

    expect(edgeKey).not.toBe(otherEdgeVoiceKey);
    expect(edgeKey).not.toBe(azureKey);
  });

  it('includes speed and text in the cache key', () => {
    const normalSpeed = buildTTSCacheKey('hello', settings({ ttsSpeed: 1 }));
    const fastSpeed = buildTTSCacheKey('hello', settings({ ttsSpeed: 1.2 }));
    const otherText = buildTTSCacheKey('hello!', settings({ ttsSpeed: 1 }));

    expect(normalSpeed).not.toBe(fastSpeed);
    expect(normalSpeed).not.toBe(otherText);
  });

  it('evicts the oldest cached URL and revokes it when the limit is reached', () => {
    const cache = new Map([
      ['old', 'blob:old'],
      ['newer', 'blob:newer']
    ]);
    const revoke = vi.fn();

    saveLimitedAudioUrl(cache, 'latest', 'blob:latest', 2, revoke);

    expect(cache.has('old')).toBe(false);
    expect(cache.get('newer')).toBe('blob:newer');
    expect(cache.get('latest')).toBe('blob:latest');
    expect(revoke).toHaveBeenCalledWith('blob:old');
  });

  it('updates an existing key without evicting another URL', () => {
    const cache = new Map([
      ['old', 'blob:old'],
      ['same', 'blob:same']
    ]);
    const revoke = vi.fn();

    saveLimitedAudioUrl(cache, 'same', 'blob:updated', 2, revoke);

    expect(Array.from(cache.keys())).toEqual(['old', 'same']);
    expect(cache.get('same')).toBe('blob:updated');
    expect(revoke).not.toHaveBeenCalled();
  });
});
