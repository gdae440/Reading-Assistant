
import React from 'react';
import { AppSettings, TTSProvider } from '../types';

interface Props {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

const COSY_VOICES = [
    { label: "女声 - Bella (温柔)", value: "FunAudioLLM/CosyVoice2-0.5B:bella" },
    { label: "女声 - Anna (新闻)", value: "FunAudioLLM/CosyVoice2-0.5B:anna" },
    { label: "女声 - Claire (清晰)", value: "FunAudioLLM/CosyVoice2-0.5B:claire" },
    { label: "男声 - Alex (沉稳)", value: "FunAudioLLM/CosyVoice2-0.5B:alex" },
    { label: "男声 - Benjamin (英伦风)", value: "FunAudioLLM/CosyVoice2-0.5B:benjamin" },
    { label: "男声 - Bob (欢快)", value: "FunAudioLLM/CosyVoice2-0.5B:bob" },
    { label: "男声 - Charles (磁性)", value: "FunAudioLLM/CosyVoice2-0.5B:charles" },
    { label: "男声 - David (标准)", value: "FunAudioLLM/CosyVoice2-0.5B:david" },
];

export const SettingsView: React.FC<Props> = ({ settings, onSave }) => {
  const handleChange = (key: keyof AppSettings, value: any) => {
    onSave({ ...settings, [key]: value });
  };

  const isCosyVoice = settings.sfTtsModel === 'FunAudioLLM/CosyVoice2-0.5B';

  return (
    <div className="w-full max-w-2xl mx-auto p-4 md:p-8 pb-24">
      <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 md:mb-8 tracking-tight">设置</h2>
      
      <div className="space-y-6">
        {/* API Section */}
        <div className="bg-white rounded-2xl shadow-[0_2px_15px_rgb(0,0,0,0.02)] border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h3 className="text-base font-semibold text-gray-900">SiliconFlow API</h3>
          </div>
          <div className="p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => handleChange('apiKey', e.target.value)}
              placeholder="sk-..."
              className="w-full px-4 py-2.5 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-gray-800 placeholder-gray-400 transition-all"
            />
            <p className="text-xs text-gray-500 mt-2">用于 AI 翻译、OCR、查词和 SiliconFlow 语音。</p>
          </div>
        </div>

        {/* Model Section */}
        <div className="bg-white rounded-2xl shadow-[0_2px_15px_rgb(0,0,0,0.02)] border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h3 className="text-base font-semibold text-gray-900">模型配置</h3>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">LLM 模型 (翻译/查词)</label>
              <input
                type="text"
                value={settings.llmModel}
                onChange={(e) => handleChange('llmModel', e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-gray-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Vision 模型 (图片识别)</label>
              <input
                type="text"
                value={settings.visionModel}
                onChange={(e) => handleChange('visionModel', e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-gray-800"
              />
            </div>
          </div>
        </div>

        {/* TTS Section */}
        <div className="bg-white rounded-2xl shadow-[0_2px_15px_rgb(0,0,0,0.02)] border border-gray-100 overflow-hidden">
           <div className="px-6 py-4 border-b border-gray-50">
             <h3 className="text-base font-semibold text-gray-900">语音合成 (TTS)</h3>
           </div>
          
           <div className="p-6 space-y-6">
                {/* TTS Provider Tabs */}
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">语音引擎</label>
                   <div className="flex p-1 bg-gray-100 rounded-xl">
                       {(['siliconflow', 'azure', 'browser'] as TTSProvider[]).map((provider) => (
                           <button
                               key={provider}
                               onClick={() => handleChange('ttsProvider', provider)}
                               className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                                   settings.ttsProvider === provider
                                   ? 'bg-white text-gray-900 shadow-sm'
                                   : 'text-gray-500 hover:text-gray-700'
                               }`}
                           >
                               {provider === 'siliconflow' ? 'SiliconFlow' : 
                                provider === 'azure' ? 'Azure TTS' : '本地浏览器'}
                           </button>
                       ))}
                   </div>
                </div>

                {/* SiliconFlow Config */}
                {settings.ttsProvider === 'siliconflow' && (
                    <div className="space-y-4 p-4 bg-blue-50/50 rounded-xl border border-blue-100/50 animate-in fade-in zoom-in-95">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">TTS 模型</label>
                            <select 
                                value={settings.sfTtsModel}
                                onChange={(e) => handleChange('sfTtsModel', e.target.value)}
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-gray-800"
                            >
                                <option value="FunAudioLLM/CosyVoice2-0.5B">FunAudioLLM/CosyVoice2-0.5B</option>
                                <option value="IndexTeam/IndexTTS-2">IndexTeam/IndexTTS-2</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">音色 (Voice ID)</label>
                            {isCosyVoice ? (
                                <select 
                                    value={settings.sfTtsVoice}
                                    onChange={(e) => handleChange('sfTtsVoice', e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-gray-800"
                                >
                                    {!COSY_VOICES.some(v => v.value === settings.sfTtsVoice) && (
                                        <option value="">请选择音色...</option>
                                    )}
                                    {COSY_VOICES.map((voice) => (
                                        <option key={voice.value} value={voice.value}>
                                            {voice.label}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={settings.sfTtsVoice}
                                    onChange={(e) => handleChange('sfTtsVoice', e.target.value)}
                                    placeholder="输入音色 ID (例如: zh, alex)"
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-gray-800"
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* Azure Config */}
                {settings.ttsProvider === 'azure' && (
                    <div className="space-y-4 p-4 bg-blue-50/50 rounded-xl border border-blue-100/50 animate-in fade-in zoom-in-95">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Azure Region (区域)</label>
                            <input
                                type="text"
                                value={settings.azureRegion}
                                onChange={(e) => handleChange('azureRegion', e.target.value)}
                                placeholder="例如: eastus, japaneast"
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-gray-800"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Azure Key (密钥)</label>
                            <input
                                type="password"
                                value={settings.azureKey}
                                onChange={(e) => handleChange('azureKey', e.target.value)}
                                placeholder="输入 Azure Speech 资源密钥"
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-gray-800"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Voice Name (音色名)</label>
                            <input
                                type="text"
                                value={settings.azureVoice}
                                onChange={(e) => handleChange('azureVoice', e.target.value)}
                                placeholder="例如: en-US-AvaMultilingualNeural"
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-gray-800"
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                可在 Azure 控制台查看支持的 Neural Voice 名称。
                            </p>
                        </div>
                    </div>
                )}

                {/* Browser Config */}
                {settings.ttsProvider === 'browser' && (
                    <div className="p-4 bg-gray-50 rounded-xl text-sm text-gray-600 border border-gray-100">
                        使用浏览器内置的语音引擎（Google/Microsoft/Apple），无需额外配置 API。
                    </div>
                )}

                {/* Speed Slider (Common) */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">跟读语速 ({settings.ttsSpeed}x)</label>
                    <div className="relative pt-1 max-w-sm">
                        <input 
                            type="range" 
                            min="0.5" 
                            max="1.5" 
                            step="0.05" 
                            value={settings.ttsSpeed}
                            onChange={(e) => handleChange('ttsSpeed', parseFloat(e.target.value))}
                            className="w-full accent-blue-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer" 
                        />
                        <div className="relative h-5 mt-2 text-xs text-gray-400 font-medium select-none w-full">
                            <span className="absolute left-0">慢 (0.5x)</span>
                            <span className="absolute left-[33%] -translate-x-1/2">0.75x</span>
                            <span className="absolute left-[66%] -translate-x-1/2">正常 (1.0x)</span>
                            <span className="absolute right-0">1.5x</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
