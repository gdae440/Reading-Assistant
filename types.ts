
export interface WordEntry {
  id: string;
  word: string;
  ipa?: string;
  meaningCn: string;
  meaningRu: string;
  contextSentence?: string;
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

  // SiliconFlow TTS Specific
  sfTtsModel: string;
  sfTtsVoice: string;

  // Azure TTS Specific
  azureKey: string;
  azureRegion: string;
  azureVoice: string;
}

export enum Tab {
  READER = 'reader',
  VOCABULARY = 'vocabulary',
  SETTINGS = 'settings'
}

export interface LookupResult {
  word: string;
  ipa: string;
  cn: string;
  ru: string;
  // example is now optional as it is loaded async
  example?: string; 
}
