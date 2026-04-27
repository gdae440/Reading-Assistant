
import React from 'react';
import { AppSettings, TTSProvider } from '../types';

interface Props {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClearKeys: () => void;
}

export const SettingsView: React.FC<Props> = ({ settings, onSave, onClearKeys }) => {
  const handleChange = (key: keyof AppSettings, value: any) => {
    onSave({ ...settings, [key]: value });
  };

  const hasSavedKeys = Boolean(settings.apiKey || settings.azureKey);
  const providerLabels: Record<TTSProvider, string> = {
    siliconflow: 'SiliconFlow',
    azure: 'Azure',
    browser: '本地',
    edge: 'Edge 免费'
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4 md:p-8 pb-24">
      <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-6 md:mb-8 tracking-tight">设置</h2>
      
      <div className="space-y-6">
        {/* API Section */}
        <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-[0_2px_15px_rgb(0,0,0,0.02)] border border-gray-100 dark:border-white/10 overflow-hidden transition-colors">
          <div className="px-6 py-4 border-b border-gray-50 dark:border-white/5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">API Key</h3>
              <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
                hasSavedKeys
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
              }`}>
                {hasSavedKeys ? '已保存到本机浏览器' : '未保存'}
              </span>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">SiliconFlow Key</label>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => handleChange('apiKey', e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-0 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 transition-all"
              />
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">用于 AI 翻译、OCR、查词和 SiliconFlow 语音。</p>
            </div>

            <div className="rounded-xl border border-amber-100 dark:border-amber-500/20 bg-amber-50/70 dark:bg-amber-900/10 p-4 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
              Key 会保存在当前浏览器本机，方便下次直接使用。请勿在公共设备或不可信浏览器中保存自己的 Key。
            </div>

            <button
              onClick={onClearKeys}
              disabled={!hasSavedKeys}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              清除本机保存的 Key
            </button>
          </div>
        </div>

        {/* Model Section */}
        <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-[0_2px_15px_rgb(0,0,0,0.02)] border border-gray-100 dark:border-white/10 overflow-hidden transition-colors">
          <div className="px-6 py-4 border-b border-gray-50 dark:border-white/5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">模型配置</h3>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">LLM 模型 (翻译/查词)</label>
              <input
                type="text"
                value={settings.llmModel}
                onChange={(e) => handleChange('llmModel', e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-0 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Vision 模型 (图片识别)</label>
              <input
                type="text"
                value={settings.visionModel}
                onChange={(e) => handleChange('visionModel', e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-0 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-gray-800 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* TTS Section */}
        <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-[0_2px_15px_rgb(0,0,0,0.02)] border border-gray-100 dark:border-white/10 overflow-hidden transition-colors">
           <div className="px-6 py-4 border-b border-gray-50 dark:border-white/5">
             <h3 className="text-base font-semibold text-gray-900 dark:text-white">语音合成 (TTS)</h3>
           </div>
          
           <div className="p-6 space-y-6">
                {/* TTS Provider Tabs */}
                <div>
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">语音引擎</label>
                   <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl overflow-x-auto">
                       {(['siliconflow', 'azure', 'browser', 'edge'] as TTSProvider[]).map((provider) => (
                           <button
                               key={provider}
                               onClick={() => handleChange('ttsProvider', provider)}
                               className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                                   settings.ttsProvider === provider
                                   ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                   : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                               }`}
                           >
                               {providerLabels[provider]}
                           </button>
                       ))}
                   </div>
                </div>

                {/* Shadowing Config */}
                <div className="p-4 bg-purple-50/50 dark:bg-purple-900/20 rounded-xl border border-purple-100/50 dark:border-purple-500/20">
                    <div className="flex items-center justify-between mb-4">
                         <div>
                            <div className="font-semibold text-gray-900 dark:text-white">跟读模式 (Shadowing)</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">开启后将按句朗读，并自动留出跟读时间。</div>
                         </div>
                         <button 
                            onClick={() => handleChange('shadowingMode', !settings.shadowingMode)}
                            className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ease-in-out ios-switch ${
                                settings.shadowingMode ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                         >
                             <div className={`w-5 h-5 bg-white rounded-full shadow-sm ios-switch-knob transform transition-transform duration-300 ${
                                 settings.shadowingMode ? 'translate-x-5' : 'translate-x-0'
                             }`}></div>
                         </button>
                    </div>

                    {settings.shadowingMode && (
                        <div className="animate-in slide-in-from-top-2 fade-in">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex justify-between">
                                <span>跟读间隔</span>
                                <span className="font-mono">{settings.shadowingPause} 秒</span>
                            </label>
                            <input 
                                type="range" min="0.5" max="5.0" step="0.5"
                                value={settings.shadowingPause}
                                onChange={(e) => handleChange('shadowingPause', parseFloat(e.target.value))}
                                className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
                            />
                        </div>
                    )}
                </div>

                {/* SiliconFlow Config */}
                {settings.ttsProvider === 'siliconflow' && (
                    <div className="space-y-4 p-4 bg-blue-50/50 dark:bg-blue-900/20 rounded-xl border border-blue-100/50 dark:border-blue-500/20 animate-in fade-in zoom-in-95">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">TTS 模型</label>
                            <select
                                value={settings.sfTtsModel}
                                onChange={(e) => {
                                    // CosyVoice2 默认音色
                                    onSave({ ...settings, sfTtsModel: e.target.value, sfTtsVoice: 'FunAudioLLM/CosyVoice2-0.5B:bella' });
                                }}
                                className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-gray-800 dark:text-white"
                            >
                                <option value="FunAudioLLM/CosyVoice2-0.5B">FunAudioLLM/CosyVoice2-0.5B</option>
                            </select>
                        </div>
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                            提示: 音色选择已移至首页“文章朗读”下方。
                        </p>
                    </div>
                )}

                {/* Azure Config */}
                {settings.ttsProvider === 'azure' && (
                    <div className="space-y-4 p-4 bg-blue-50/50 dark:bg-blue-900/20 rounded-xl border border-blue-100/50 dark:border-blue-500/20 animate-in fade-in zoom-in-95">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Azure Region (区域)</label>
                            <input
                                type="text"
                                value={settings.azureRegion}
                                onChange={(e) => handleChange('azureRegion', e.target.value)}
                                placeholder="例如: eastus, japaneast"
                                className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-gray-800 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Azure Key (密钥)</label>
                            <input
                                type="password"
                                value={settings.azureKey}
                                onChange={(e) => handleChange('azureKey', e.target.value)}
                                placeholder="输入 Azure Speech 资源密钥"
                                autoComplete="off"
                                spellCheck={false}
                                className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-gray-800 dark:text-white"
                            />
                        </div>
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                            提示: 音色选择已移至首页“文章朗读”下方。
                        </p>
                    </div>
                )}
                
                {/* Browser Config */}
                {settings.ttsProvider === 'browser' && (
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm text-gray-600 dark:text-gray-400 border border-gray-100 dark:border-gray-700">
                        使用浏览器或系统本机语音，免 Key，优先离线可用。高质量声音通常需要先在系统设置中下载。
                    </div>
                )}

                {settings.ttsProvider === 'edge' && (
                    <div className="space-y-3 p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl text-sm text-orange-800 dark:text-orange-200 border border-orange-100 dark:border-orange-500/20">
                        <p>
                            使用非官方 Edge Read Aloud 云端语音，免用户 Key。前端会请求本项目的 <span className="font-mono">/api/edge-tts</span>，由本地 dev middleware 或 Vercel Function 转发合成。
                        </p>
                        <p className="text-xs text-orange-700/80 dark:text-orange-200/80">
                            这是实验方案：音质好、成本低，但不是微软公开 API，可能因微软协议变化而失效。
                        </p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};
