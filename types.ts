
export interface WordEntry {
  id: string;
  word: string;
  reading?: string; // e.g., Japanese Furigana
  ipa?: string;
  meaningCn: string;
  meaningRu: string;
  contextSentence?: string;
  timestamp: number;
}

export interface HistoryEntry {
  id: string;
  original: string;
  translation: string;
  type: 'translation' | 'reply';
  timestamp: number;
}

export type TTSProvider = 'siliconflow' | 'azure' | 'browser';

export interface AppSettings {
  apiKey: string; // SiliconFlow Key
  llmModel: string;
  visionModel: string;
  
  // TTS General
  ttsProvider: TTSProvider;
  ttsSpeed: number;
  
  // Shadowing Mode
  shadowingMode: boolean;
  shadowingPause: number; // Seconds

  // SiliconFlow TTS Specific
  sfTtsModel: string;
  sfTtsVoice: string;

  // Azure TTS Specific
  azureKey: string;
  azureRegion: string;
  azureVoice: string;

  // Browser TTS Specific
  browserVoice: string; // ID/URI of the browser voice
}

export enum Tab {
  READER = 'reader',
  VOCABULARY = 'vocabulary',
  SETTINGS = 'settings'
}

export interface LookupResult {
  word: string;
  reading?: string; // New: pronunciation for non-Latin scripts
  ipa: string;
  cn: string;
  ru: string;
  // example is now optional as it is loaded async
  example?: string; 
}

export interface AnalysisItem {
  text: string;
  cn: string;
  reading?: string; // 音标/读音
  ipa?: string;     // 国际音标
  ru?: string;      // 俄语翻译
}

export interface AnalysisSentence {
  text: string;
  cn: string;
  reason: string;
}

export interface AnalysisResult {
  collocations: AnalysisItem[];
  vocabulary: AnalysisItem[];
  sentences: AnalysisSentence[];
}