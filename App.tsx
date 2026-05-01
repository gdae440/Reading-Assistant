
import React, { useState, useEffect } from 'react';
import { Tab, AppSettings, WordEntry, HistoryEntry } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { ReaderView } from './views/ReaderView';
import { VocabularyView } from './views/VocabularyView';
import { SettingsView } from './views/SettingsView';
import {
  migrateLegacyAzureVoice,
  migrateLegacyTTSProvider,
  splitSettingsSecrets
} from './utils/settingsMigration';
import {
  createBackup,
  parseBackupJson,
  stringifyBackup
} from './utils/backupData';

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  llmModel: 'deepseek-ai/DeepSeek-V3.2',
  visionModel: 'Qwen/Qwen3-VL-32B-Instruct',

  ttsProvider: 'browser', // 默认使用浏览器内置 TTS
  ttsSpeed: 1.0,
  
  // Shadowing Defaults
  shadowingMode: false,
  shadowingPause: 2.0,

  // SiliconFlow Defaults
  sfTtsModel: 'FunAudioLLM/CosyVoice2-0.5B',
  sfTtsVoice: 'FunAudioLLM/CosyVoice2-0.5B:bella', 

  // Azure Defaults
  azureKey: '',
  azureRegion: 'westcentralus', 
  azureVoice: 'en-US-AvaMultilingualNeural',

  // Browser Defaults
  browserVoice: '', // Empty means "System Default"
  edgeVoice: 'en-US-AvaMultilingualNeural'
};

const DEFAULT_SECRET_KEYS = {
  apiKey: '',
  azureKey: ''
};

const READER_TEXT_STORAGE_KEY = 'reader_text';

const readStoredReaderText = () => {
  if (typeof window === 'undefined') return '';

  const raw = window.localStorage.getItem(READER_TEXT_STORAGE_KEY);
  if (!raw) return '';

  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : '';
  } catch {
    return raw;
  }
};

const writeStoredJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

function App() {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.READER);
  const [storedSettings, setStoredSettings] = useLocalStorage<AppSettings>('polyglot_settings', DEFAULT_SETTINGS);
  const [secretKeys, setSecretKeys] = useLocalStorage<typeof DEFAULT_SECRET_KEYS>('polyglot_secret_keys', DEFAULT_SECRET_KEYS);
  const [vocab, setVocab] = useLocalStorage<WordEntry[]>('polyglot_vocab', []);
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>('polyglot_history', []);
  const settings: AppSettings = { ...DEFAULT_SETTINGS, ...storedSettings, ...secretKeys };

  const handleSettingsChange = (nextSettings: AppSettings | ((prev: AppSettings) => AppSettings)) => {
    const resolved = typeof nextSettings === 'function' ? nextSettings(settings) : nextSettings;
    const { apiKey, azureKey, ...safeSettings } = resolved;
    setSecretKeys({ apiKey, azureKey });
    setStoredSettings({ ...safeSettings, apiKey: '', azureKey: '' });
  };

  const handleClearKeys = () => {
    setSecretKeys(DEFAULT_SECRET_KEYS);
    setStoredSettings(prev => ({ ...prev, apiKey: '', azureKey: '' }));
  };

  // Migrate keys that older versions stored inside the general settings object.
  useEffect(() => {
    if (!storedSettings.apiKey && !storedSettings.azureKey) return;

    const migrated = splitSettingsSecrets(storedSettings, secretKeys);
    setSecretKeys(migrated.secretKeys);
    setStoredSettings(migrated.storedSettings);
  }, [storedSettings, secretKeys, setSecretKeys, setStoredSettings]);

  // Migration Effect: Fix broken voices (e.g., Ollie) for existing users
  useEffect(() => {
    const migratedVoice = migrateLegacyAzureVoice(settings.azureVoice);
    if (migratedVoice !== settings.azureVoice) {
        handleSettingsChange(prev => ({ ...prev, azureVoice: migratedVoice }));
    }
  }, [settings.azureVoice]);

  useEffect(() => {
    const migratedProvider = migrateLegacyTTSProvider(settings.ttsProvider as AppSettings['ttsProvider'] | 'browser-cloud');
    if (migratedProvider !== settings.ttsProvider) {
      handleSettingsChange(prev => ({ ...prev, ttsProvider: migratedProvider }));
    }
  }, [settings.ttsProvider]);

  const handleAddToVocab = (entry: WordEntry) => {
    setVocab((currentVocab) => {
        // Avoid duplicates based on word text
        if (!currentVocab.some(v => v.word.toLowerCase() === entry.word.toLowerCase())) {
            return [entry, ...currentVocab];
        }
        return currentVocab;
    });
  };

  const handleUpdateVocabEntry = (id: string, updates: Partial<WordEntry>) => {
      setVocab((currentVocab) => 
        currentVocab.map(entry => 
            entry.id === id ? { ...entry, ...updates } : entry
        )
      );
  };

  const handleRemoveFromVocab = (ids: string[]) => {
    setVocab((currentVocab) => {
        const idSet = new Set(ids);
        return currentVocab.filter(v => !idSet.has(v.id));
    });
  };

  const handleAddToHistory = (entry: HistoryEntry) => {
    setHistory((prev) => {
        const newHistory = [entry, ...prev];
        return newHistory.slice(0, 50); // Keep max 50 entries
    });
  };

  const handleExportBackup = () => {
    const backup = createBackup({
      settings,
      vocab,
      history,
      readerText: readStoredReaderText()
    });
    const blob = new Blob([stringifyBackup(backup)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);

    anchor.href = url;
    anchor.download = `polyglot-backup-${date}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (file: File) => {
    const text = await file.text();
    const restored = parseBackupJson(text, settings);
    const nextSettings: AppSettings = {
      ...restored.settings,
      apiKey: settings.apiKey,
      azureKey: settings.azureKey
    };
    const { apiKey, azureKey, ...safeSettings } = nextSettings;
    const nextSecrets = { apiKey, azureKey };
    const nextStoredSettings = { ...safeSettings, apiKey: '', azureKey: '' };
    const nextHistory = restored.history.slice(0, 50);

    writeStoredJson('polyglot_settings', nextStoredSettings);
    writeStoredJson('polyglot_secret_keys', nextSecrets);
    writeStoredJson('polyglot_vocab', restored.vocab);
    writeStoredJson('polyglot_history', nextHistory);
    writeStoredJson(READER_TEXT_STORAGE_KEY, restored.readerText);

    setStoredSettings(nextStoredSettings);
    setSecretKeys(nextSecrets);
    setVocab(restored.vocab);
    setHistory(nextHistory);
    setActiveTab(Tab.READER);
  };

  const renderContent = () => {
    switch (activeTab) {
      case Tab.READER:
        return (
            <ReaderView 
                vocab={vocab}
                settings={settings} 
                onAddToVocab={handleAddToVocab} 
                onUpdateVocabEntry={handleUpdateVocabEntry}
                onSettingsChange={handleSettingsChange}
                onAddToHistory={handleAddToHistory}
            />
        );
      case Tab.VOCABULARY:
        return (
            <VocabularyView
                vocab={vocab}
                history={history}
                onRemove={handleRemoveFromVocab}
                onUpdate={handleUpdateVocabEntry}
            />
        );
      case Tab.SETTINGS:
        return (
          <SettingsView
            settings={settings}
            onSave={handleSettingsChange}
            onClearKeys={handleClearKeys}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col selection:bg-blue-100 selection:text-blue-900 dark:selection:bg-blue-900 dark:selection:text-blue-100">
      {/* Navbar: Apple style blurred sticky header */}
      <nav className="sticky top-0 z-50 glass-panel border-b border-gray-200/50 dark:border-white/10 pt-[env(safe-area-inset-top)] transition-all">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-black dark:text-white">
                  跟读助手
                </span>
            </div>
            
            <div className="flex space-x-1 bg-gray-100/80 dark:bg-gray-800/80 p-1 rounded-full backdrop-blur-sm">
              <button
                onClick={() => setActiveTab(Tab.READER)}
                className={`px-5 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                  activeTab === Tab.READER 
                  ? 'bg-white dark:bg-gray-600 text-black dark:text-white shadow-sm' 
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                文章朗读
              </button>
              <button
                onClick={() => setActiveTab(Tab.VOCABULARY)}
                className={`px-5 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                  activeTab === Tab.VOCABULARY
                  ? 'bg-white dark:bg-gray-600 text-black dark:text-white shadow-sm' 
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                生词本
              </button>
              <button
                onClick={() => setActiveTab(Tab.SETTINGS)}
                className={`px-5 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                  activeTab === Tab.SETTINGS
                  ? 'bg-white dark:bg-gray-600 text-black dark:text-white shadow-sm' 
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                设置
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-hidden relative w-full max-w-5xl mx-auto">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
