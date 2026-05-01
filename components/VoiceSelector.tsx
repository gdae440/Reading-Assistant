import type React from 'react';
import type { AppSettings } from '../types';
import { AZURE_VOICES } from '../services/azureTTS';
import { EDGE_TTS_VOICES } from '../services/edgeTTSClient';
import { isBrowserProvider } from '../hooks/useTTSPlayback';

export interface VoiceOption {
  value: string;
  label: string;
}

export const SF_VOICES: VoiceOption[] = [
  { label: 'Anna (沉稳女声)', value: 'FunAudioLLM/CosyVoice2-0.5B:anna' },
  { label: 'Bella (激情女声)', value: 'FunAudioLLM/CosyVoice2-0.5B:bella' },
  { label: 'Claire (温柔女声)', value: 'FunAudioLLM/CosyVoice2-0.5B:claire' },
  { label: 'Diana (欢快女声)', value: 'FunAudioLLM/CosyVoice2-0.5B:diana' },
  { label: 'Alex (沉稳男声)', value: 'FunAudioLLM/CosyVoice2-0.5B:alex' },
  { label: 'Benjamin (低沉男声)', value: 'FunAudioLLM/CosyVoice2-0.5B:benjamin' },
  { label: 'Charles (磁性男声)', value: 'FunAudioLLM/CosyVoice2-0.5B:charles' },
  { label: 'David (欢快男声)', value: 'FunAudioLLM/CosyVoice2-0.5B:david' },
  { label: 'Qian (女 - 中文)', value: 'FunAudioLLM/CosyVoice2-0.5B:qian' },
  { label: 'Meimei (女 - 中文)', value: 'FunAudioLLM/CosyVoice2-0.5B:meimei' },
  { label: 'Zhe (男 - 中文)', value: 'FunAudioLLM/CosyVoice2-0.5B:zhe' },
  { label: 'Adam (男 - 英文/多语)', value: 'FunAudioLLM/CosyVoice2-0.5B:adam' }
];

interface VoiceSelectorProps {
  settings: AppSettings;
  browserVoicesLoading: boolean;
  browserVoiceOptions: VoiceOption[];
  onVoiceChange: (value: string) => void;
  onShowVoiceInfo: () => void;
}

const selectedVoiceValue = (settings: AppSettings) => {
  if (settings.ttsProvider === 'siliconflow') return settings.sfTtsVoice;
  if (settings.ttsProvider === 'azure') return settings.azureVoice;
  if (settings.ttsProvider === 'edge') return settings.edgeVoice;
  return settings.browserVoice;
};

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({
  settings,
  browserVoicesLoading,
  browserVoiceOptions,
  onVoiceChange,
  onShowVoiceInfo
}) => {
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="relative flex-1">
        <select
          aria-label="选择语音"
          value={selectedVoiceValue(settings)}
          onChange={(e) => onVoiceChange(e.target.value)}
          className="w-full bg-transparent font-bold text-gray-900 dark:text-white text-sm focus:outline-none appearance-none pr-8 cursor-pointer truncate"
        >
          {settings.ttsProvider === 'siliconflow' && SF_VOICES.map((voice) => (
            <option key={voice.value} value={voice.value}>{voice.label}</option>
          ))}
          {settings.ttsProvider === 'azure' && AZURE_VOICES.map((voice) => (
            <option key={voice.value} value={voice.value}>{voice.label}</option>
          ))}
          {settings.ttsProvider === 'edge' && EDGE_TTS_VOICES.map((voice) => (
            <option key={voice.value} value={voice.value}>{voice.label}</option>
          ))}
          {isBrowserProvider(settings.ttsProvider) && (
            <>
              <option value="">
                {browserVoicesLoading
                  ? '正在加载音色...'
                  : '系统默认音色'}
              </option>
              {browserVoiceOptions.map((voice) => (
                <option key={voice.value} value={voice.value}>{voice.label}</option>
              ))}
            </>
          )}
        </select>
        <svg className="w-4 h-4 text-gray-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
      </div>

      {(isBrowserProvider(settings.ttsProvider) || settings.ttsProvider === 'azure' || settings.ttsProvider === 'edge') && (
        <button
          onClick={onShowVoiceInfo}
          className="p-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 flex-none"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        </button>
      )}
    </div>
  );
};
