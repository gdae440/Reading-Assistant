import { describe, expect, it } from 'vitest';
import type { AppSettings } from '../types';
import {
  migrateLegacyAzureVoice,
  migrateLegacyTTSProvider,
  splitSettingsSecrets
} from './settingsMigration';

const settings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  apiKey: '',
  llmModel: 'deepseek-ai/DeepSeek-V3.2',
  visionModel: 'Qwen/Qwen3-VL-32B-Instruct',
  ttsProvider: 'browser',
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

describe('settings migration helpers', () => {
  it('moves legacy API keys out of the general settings payload', () => {
    const migrated = splitSettingsSecrets(
      settings({
        apiKey: 'sf-key',
        azureKey: 'azure-key'
      }),
      { apiKey: '', azureKey: '' }
    );

    expect(migrated.secretKeys).toEqual({
      apiKey: 'sf-key',
      azureKey: 'azure-key'
    });
    expect(migrated.storedSettings.apiKey).toBe('');
    expect(migrated.storedSettings.azureKey).toBe('');
  });

  it('keeps existing secret keys when migrating older settings', () => {
    const migrated = splitSettingsSecrets(
      settings({
        apiKey: 'legacy-sf-key',
        azureKey: 'legacy-azure-key'
      }),
      { apiKey: 'current-sf-key', azureKey: 'current-azure-key' }
    );

    expect(migrated.secretKeys).toEqual({
      apiKey: 'current-sf-key',
      azureKey: 'current-azure-key'
    });
  });

  it('maps legacy browser-cloud provider to Edge cloud TTS', () => {
    expect(migrateLegacyTTSProvider('browser-cloud')).toBe('edge');
    expect(migrateLegacyTTSProvider('browser')).toBe('browser');
  });

  it('replaces the removed Azure Ollie voice with Ryan', () => {
    expect(migrateLegacyAzureVoice('en-GB-OllieNeural')).toBe('en-GB-RyanNeural');
    expect(migrateLegacyAzureVoice('en-US-AvaMultilingualNeural')).toBe('en-US-AvaMultilingualNeural');
  });
});
