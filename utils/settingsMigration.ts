import type { AppSettings } from '../types';

export interface SecretKeys {
  apiKey: string;
  azureKey: string;
}

export const migrateLegacyAzureVoice = (voice: string): string =>
  voice === 'en-GB-OllieNeural' ? 'en-GB-RyanNeural' : voice;

export const migrateLegacyTTSProvider = (provider: AppSettings['ttsProvider'] | 'browser-cloud'): AppSettings['ttsProvider'] =>
  provider === 'browser-cloud' ? 'edge' : provider;

export const splitSettingsSecrets = (
  storedSettings: AppSettings,
  currentSecretKeys: SecretKeys
): { storedSettings: AppSettings; secretKeys: SecretKeys } => {
  const { apiKey, azureKey, ...safeSettings } = storedSettings;

  return {
    storedSettings: { ...safeSettings, apiKey: '', azureKey: '' },
    secretKeys: {
      apiKey: currentSecretKeys.apiKey || apiKey,
      azureKey: currentSecretKeys.azureKey || azureKey
    }
  };
};
