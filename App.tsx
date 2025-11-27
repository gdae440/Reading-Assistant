
import React, { useState, useEffect } from 'react';
import { Tab, AppSettings, WordEntry, HistoryEntry } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { ReaderView } from './views/ReaderView';
import { VocabularyView } from './views/VocabularyView';
import { SettingsView } from './views/SettingsView';

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  llmModel: 'deepseek-ai/DeepSeek-V3.2-Exp',
  visionModel: 'Qwen/Qwen3-VL-32B-Instruct',
  
  ttsProvider: 'google', // Default to Google Free TTS
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
  browserVoice: '' // Empty means "System Default"
};

function App() {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.READER);
  const [settings, setSettings] = useLocalStorage<AppSettings>('polyglot_settings', DEFAULT_SETTINGS);
  const [vocab, setVocab] = useLocalStorage<WordEntry[]>('polyglot_vocab', []);
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>('polyglot_history', []);

  // Migration Effect: Fix broken voices (e.g., Ollie) for existing users
  useEffect(() => {
    if (settings.azureVoice === 'en-GB-OllieNeural') {
        setSettings(prev => ({ ...prev, azureVoice: 'en-GB-RyanNeural' }));
    }
  }, [settings.azureVoice, setSettings]);

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

  const renderContent = () => {
    switch (activeTab) {
      case Tab.READER:
        return (
            <ReaderView 
                settings={settings} 
                onAddToVocab={handleAddToVocab} 
                onUpdateVocabEntry={handleUpdateVocabEntry}
                onSettingsChange={setSettings}
                onAddToHistory={handleAddToHistory}
            />
        );
      case Tab.VOCABULARY:
        return <VocabularyView vocab={vocab} history={history} onRemove={handleRemoveFromVocab} />;
      case Tab.SETTINGS:
        return <SettingsView settings={settings} onSave={setSettings} />;
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