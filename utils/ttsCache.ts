import type { AppSettings } from '../types';

export const buildTTSCacheKey = (text: string, settings: AppSettings): string =>
  JSON.stringify({
    text,
    provider: settings.ttsProvider,
    sfModel: settings.sfTtsModel,
    sfVoice: settings.sfTtsVoice,
    azureRegion: settings.azureRegion,
    azureVoice: settings.azureVoice,
    edgeVoice: settings.edgeVoice,
    speed: settings.ttsSpeed
  });

export const saveLimitedAudioUrl = (
  cache: Map<string, string>,
  key: string,
  url: string,
  maxSize = 10,
  revokeObjectUrl: (url: string) => void = URL.revokeObjectURL
) => {
  if (cache.size >= maxSize && !cache.has(key)) {
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      const firstUrl = cache.get(firstKey);
      if (firstUrl) revokeObjectUrl(firstUrl);
      cache.delete(firstKey);
    }
  }

  cache.set(key, url);
};
