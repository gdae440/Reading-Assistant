import type { AppSettings, HistoryEntry, TTSProvider, VocabReviewStats, WordEntry } from '../types';
import { defaultReviewStats, normalizeVocabEntry } from './vocabReview';

export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_APP_ID = 'polyglot-shadowing-assistant';

export interface AppBackupData {
  app: typeof BACKUP_APP_ID;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  data: {
    settings: AppSettings;
    vocab: WordEntry[];
    history: HistoryEntry[];
    readerText: string;
  };
}

export interface BackupInput {
  settings: AppSettings;
  vocab: WordEntry[];
  history: HistoryEntry[];
  readerText?: string;
}

export interface RestoredBackupData {
  settings: AppSettings;
  vocab: WordEntry[];
  history: HistoryEntry[];
  readerText: string;
}

const TTS_PROVIDERS: TTSProvider[] = ['siliconflow', 'azure', 'browser', 'edge'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const asNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asBoolean = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

const asTTSProvider = (value: unknown, fallback: TTSProvider): TTSProvider =>
  TTS_PROVIDERS.includes(value as TTSProvider) ? value as TTSProvider : fallback;

export const redactBackupSettings = (settings: AppSettings): AppSettings => ({
  ...settings,
  apiKey: '',
  azureKey: ''
});

export const createBackup = ({
  settings,
  vocab,
  history,
  readerText = ''
}: BackupInput): AppBackupData => ({
  app: BACKUP_APP_ID,
  schemaVersion: BACKUP_SCHEMA_VERSION,
  exportedAt: new Date().toISOString(),
  data: {
    settings: redactBackupSettings(settings),
    vocab: vocab.map(normalizeVocabEntry),
    history: history.map(normalizeHistoryEntry).filter(Boolean) as HistoryEntry[],
    readerText
  }
});

export const stringifyBackup = (backup: AppBackupData) =>
  JSON.stringify(backup, null, 2);

export const parseBackupJson = (
  jsonText: string,
  fallbackSettings: AppSettings
): RestoredBackupData => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('备份文件不是有效 JSON。');
  }

  if (!isRecord(parsed) || parsed.app !== BACKUP_APP_ID) {
    throw new Error('这不是跟读助手的备份文件。');
  }

  if (parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error(`暂不支持该备份版本：${String(parsed.schemaVersion)}。`);
  }

  if (!isRecord(parsed.data)) {
    throw new Error('备份文件缺少 data 字段。');
  }

  const settings = normalizeBackupSettings(parsed.data.settings, fallbackSettings);
  const vocab = normalizeBackupVocab(parsed.data.vocab);
  const history = normalizeBackupHistory(parsed.data.history);
  const readerText = asString(parsed.data.readerText);

  return { settings, vocab, history, readerText };
};

const normalizeBackupSettings = (
  value: unknown,
  fallback: AppSettings
): AppSettings => {
  if (!isRecord(value)) {
    throw new Error('备份文件里的设置格式不正确。');
  }

  return {
    ...fallback,
    apiKey: '',
    llmModel: asString(value.llmModel, fallback.llmModel),
    visionModel: asString(value.visionModel, fallback.visionModel),
    ttsProvider: asTTSProvider(value.ttsProvider, fallback.ttsProvider),
    ttsSpeed: asNumber(value.ttsSpeed, fallback.ttsSpeed),
    shadowingMode: asBoolean(value.shadowingMode, fallback.shadowingMode),
    shadowingPause: asNumber(value.shadowingPause, fallback.shadowingPause),
    sfTtsModel: asString(value.sfTtsModel, fallback.sfTtsModel),
    sfTtsVoice: asString(value.sfTtsVoice, fallback.sfTtsVoice),
    azureKey: '',
    azureRegion: asString(value.azureRegion, fallback.azureRegion),
    azureVoice: asString(value.azureVoice, fallback.azureVoice),
    browserVoice: asString(value.browserVoice, fallback.browserVoice),
    edgeVoice: asString(value.edgeVoice, fallback.edgeVoice),
    browserCloudVoice: asString(value.browserCloudVoice, fallback.browserCloudVoice)
  };
};

const normalizeBackupVocab = (value: unknown): WordEntry[] => {
  if (!Array.isArray(value)) {
    throw new Error('备份文件里的生词数据格式不正确。');
  }

  return value.map(normalizeBackupWordEntry);
};

const normalizeBackupWordEntry = (value: unknown, index: number): WordEntry => {
  if (!isRecord(value)) {
    throw new Error(`第 ${index + 1} 个生词格式不正确。`);
  }

  const word = asString(value.word).trim();
  if (!word) {
    throw new Error(`第 ${index + 1} 个生词缺少 word。`);
  }

  const timestamp = asNumber(value.timestamp, Date.now());
  const entry: WordEntry = {
    id: asString(value.id, `word-${timestamp}-${index}`),
    word,
    reading: asString(value.reading) || undefined,
    ipa: asString(value.ipa),
    meaningCn: asString(value.meaningCn),
    meaningRu: asString(value.meaningRu),
    contextSentence: asString(value.contextSentence) || undefined,
    timestamp,
    familiarity: value.familiarity === 'known' || value.familiarity === 'mastered'
      ? value.familiarity
      : 'new',
    reviewStats: normalizeBackupReviewStats(value.reviewStats, timestamp),
    reviewLog: Array.isArray(value.reviewLog) ? value.reviewLog as WordEntry['reviewLog'] : undefined
  };

  return normalizeVocabEntry(entry);
};

const normalizeBackupReviewStats = (
  value: unknown,
  timestamp: number
): VocabReviewStats | undefined => {
  if (!isRecord(value)) return undefined;

  const fallback = defaultReviewStats(timestamp);
  return {
    schedulerVersion: asString(value.schedulerVersion, fallback.schedulerVersion),
    dueAt: asNumber(value.dueAt, fallback.dueAt),
    lastReviewedAt: typeof value.lastReviewedAt === 'number' && Number.isFinite(value.lastReviewedAt)
      ? value.lastReviewedAt
      : undefined,
    reviewCount: asNumber(value.reviewCount, fallback.reviewCount),
    correctCount: asNumber(value.correctCount, fallback.correctCount),
    wrongCount: asNumber(value.wrongCount, fallback.wrongCount),
    lapseCount: asNumber(value.lapseCount, fallback.lapseCount),
    difficulty: asNumber(value.difficulty, fallback.difficulty),
    stability: asNumber(value.stability, fallback.stability),
    retrievability: asNumber(value.retrievability, fallback.retrievability)
  };
};

const normalizeBackupHistory = (value: unknown): HistoryEntry[] => {
  if (!Array.isArray(value)) {
    throw new Error('备份文件里的历史记录格式不正确。');
  }

  return value.map(normalizeHistoryEntry).filter(Boolean) as HistoryEntry[];
};

const normalizeHistoryEntry = (value: unknown, index = 0): HistoryEntry | null => {
  if (!isRecord(value)) return null;

  const original = asString(value.original);
  const translation = asString(value.translation);
  if (!original && !translation) return null;

  return {
    id: asString(value.id, `history-${Date.now()}-${index}`),
    original,
    translation,
    type: value.type === 'reply' ? 'reply' : 'translation',
    timestamp: asNumber(value.timestamp, Date.now())
  };
};
