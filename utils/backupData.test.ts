import { describe, expect, it } from 'vitest';
import type { AppSettings, WordEntry } from '../types';
import {
  BACKUP_APP_ID,
  BACKUP_SCHEMA_VERSION,
  createBackup,
  parseBackupJson,
  stringifyBackup
} from './backupData';

const settings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  apiKey: 'sf-secret',
  llmModel: 'deepseek-ai/DeepSeek-V3.2',
  visionModel: 'Qwen/Qwen3-VL-32B-Instruct',
  ttsProvider: 'edge',
  ttsSpeed: 1,
  shadowingMode: false,
  shadowingPause: 2,
  sfTtsModel: 'FunAudioLLM/CosyVoice2-0.5B',
  sfTtsVoice: 'FunAudioLLM/CosyVoice2-0.5B:bella',
  azureKey: 'azure-secret',
  azureRegion: 'westcentralus',
  azureVoice: 'en-US-AvaMultilingualNeural',
  browserVoice: '',
  edgeVoice: 'en-US-AvaMultilingualNeural',
  ...overrides
});

const word = (overrides: Partial<WordEntry> = {}): WordEntry => ({
  id: 'word-1',
  word: 'example',
  ipa: '',
  meaningCn: '例子',
  meaningRu: '',
  timestamp: 1714452000000,
  ...overrides
});

describe('backup data helpers', () => {
  it('creates a versioned JSON backup without API keys', () => {
    const backup = createBackup({
      settings: settings(),
      vocab: [word()],
      history: [],
      readerText: 'Hello.'
    });

    expect(backup.app).toBe(BACKUP_APP_ID);
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(backup.data.settings.apiKey).toBe('');
    expect(backup.data.settings.azureKey).toBe('');
    expect(backup.data.readerText).toBe('Hello.');
  });

  it('parses a valid backup and normalizes legacy vocab entries', () => {
    const backup = createBackup({
      settings: settings({ ttsSpeed: 1.25 }),
      vocab: [word({ reviewStats: undefined, reviewLog: undefined })],
      history: [{
        id: 'history-1',
        original: 'hello',
        translation: '你好',
        type: 'translation',
        timestamp: 1714452000000
      }],
      readerText: 'Article'
    });

    const restored = parseBackupJson(stringifyBackup(backup), settings({
      apiKey: 'current-key',
      azureKey: 'current-azure'
    }));

    expect(restored.settings.ttsSpeed).toBe(1.25);
    expect(restored.settings.apiKey).toBe('');
    expect(restored.vocab[0].reviewStats).toMatchObject({
      schedulerVersion: 'fsrs-lite-v1',
      reviewCount: 0,
      difficulty: 5
    });
    expect(restored.history).toHaveLength(1);
    expect(restored.readerText).toBe('Article');
  });

  it('sanitizes malformed review stats during import', () => {
    const backup = createBackup({
      settings: settings(),
      vocab: [word()],
      history: [],
      readerText: ''
    });
    backup.data.vocab[0].reviewStats = {
      dueAt: 'bad',
      reviewCount: 'bad',
      correctCount: 1,
      wrongCount: 2,
      lapseCount: 3,
      difficulty: 'bad',
      stability: 4,
      retrievability: 0.8
    } as any;

    const restored = parseBackupJson(JSON.stringify(backup), settings());

    expect(restored.vocab[0].reviewStats).toMatchObject({
      dueAt: 1714452000000,
      reviewCount: 0,
      correctCount: 1,
      difficulty: 5,
      stability: 4
    });
  });

  it('rejects files from another app', () => {
    expect(() => parseBackupJson(
      JSON.stringify({ app: 'other', schemaVersion: 1, data: {} }),
      settings()
    )).toThrow('不是跟读助手');
  });

  it('rejects unsupported schema versions', () => {
    expect(() => parseBackupJson(
      JSON.stringify({ app: BACKUP_APP_ID, schemaVersion: 999, data: {} }),
      settings()
    )).toThrow('暂不支持');
  });
});
