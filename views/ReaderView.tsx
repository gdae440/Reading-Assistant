import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AppSettings, WordEntry, LookupResult, HistoryEntry } from '../types';
import { SiliconFlowService } from '../services/siliconFlow';
import { AzureTTSService, AZURE_VOICES } from '../services/azureTTS';
import { WordDetailModal } from '../components/WordDetailModal';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface Props {
  settings: AppSettings;
  onAddToVocab: (entry: WordEntry) => void;
  onUpdateVocabEntry: (id: string, updates: Partial<WordEntry>) => void;
  onSettingsChange: (newSettings: AppSettings) => void;
  onAddToHistory: (entry: HistoryEntry) => void;
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

export const ReaderView: React.FC<Props> = ({ settings, onAddToVocab, onUpdateVocabEntry, onSettingsChange, onAddToHistory }) => {
  // Persistence: Use local storage for text and translation so they survive tab switches
  const [text, setText] = useLocalStorage<string>('reader_text', '');
  const [translation, setTranslation] = useLocalStorage<string>('reader_translation', '');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const [lookupPos, setLookupPos] = useState<{ x: number, y: number } | null>(null);
  const [lookupData, setLookupData] = useState<LookupResult | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // BUG FIX: Refs to track scrolling and selection to prevent ghost lookups on iPhone
  const isScrolling = useRef(false);
  const lastSelection = useRef<string>("");

  const sfService = new SiliconFlowService(settings.apiKey);

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  // --- Auto-Detect Language & Recommend Voice ---
  const detectedLang = useMemo(() => {
    if (!text) return 'en';
    
    // Priority 1: Check for Japanese (Hiragana/Katakana) FIRST.
    // Japanese text almost always contains Kana + Kanji.
    if (/[\u3040-\u30ff\u3400-\u4dbf]/.test(text)) return 'ja';

    // Priority 2: Check for Chinese characters anywhere in the text.
    // Only match if Kana check failed, implying it's likely Chinese.
    if (/[\u4e00-\u9fa5]/.test(text)) return 'zh';

    // Priority 3: Check for Cyrillic (Russian)
    if (/[а-яА-ЯЁё]/.test(text)) return 'ru';

    // Default Latin
    return 'en';
  }, [text]);

  const availableVoices = useMemo(() => {
    if (settings.ttsProvider === 'azure') {
        // Filter AZURE_VOICES based on detected language
        if (detectedLang === 'ru') {
            return AZURE_VOICES.filter(v => v.value.startsWith('ru-RU'));
        }
        if (detectedLang === 'zh') {
            return AZURE_VOICES.filter(v => v.value.startsWith('zh-CN'));
        }
        if (detectedLang === 'ja') {
            return AZURE_VOICES.filter(v => v.value.startsWith('ja-JP'));
        }
        // For 'en' or others
        return AZURE_VOICES.filter(v => !v.value.startsWith('ru-RU') && !v.value.startsWith('zh-CN') && !v.value.startsWith('ja-JP'));
    }
    // SiliconFlow CosyVoice
    return COSY_VOICES;
  }, [settings.ttsProvider, detectedLang]);

  // Touch Move handler to detect scrolling
  const handleTouchMove = () => {
      isScrolling.current = true;
  };

  const handleSelection = (e: React.MouseEvent<HTMLTextAreaElement> | React.TouchEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // If user was scrolling, ignore this event (it's likely a touchEnd from a scroll)
    if (isScrolling.current) {
        // Reset scrolling flag after a short delay
        setTimeout(() => { isScrolling.current = false; }, 200);
        return;
    }

    setTimeout(() => {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end).trim();

        if (selectedText.length === 0) {
            setLookupPos(null);
            return;
        }

        if (selectedText === lastSelection.current && lookupPos !== null) {
            return;
        }

        if (selectedText.length > 0 && selectedText.length < 50) {
            lastSelection.current = selectedText;

            const isMobile = window.innerWidth < 768;
            let clientX: number, clientY: number;

            if ('changedTouches' in e) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            let x, y;
            if (isMobile) {
                x = (window.innerWidth - 320) / 2;
                y = clientY + 20;
            } else {
                x = Math.min(clientX, window.innerWidth - 350);
                y = clientY + 20;
            }
            
            setLookupPos({ x: Math.max(10, x), y });
            performLookup(selectedText);
        }
    }, 10);
  };

  const performLookup = async (word: string) => {
    setIsLookingUp(true);
    setLookupData(null);

    if (!settings.apiKey) {
      setLookupData({ word, ipa: '', cn: '未配置 API Key', ru: '请在设置中配置', example: '' });
      setIsLookingUp(false);
      return;
    }

    try {
      // Pass detectedLang mainly for context, but lookupWordFast now also checks the word itself
      const result = await sfService.lookupWordFast(word, settings.llmModel, detectedLang);
      setLookupData(result);
      
      const newId = Date.now().toString() + "-" + Math.random().toString(36).substring(2, 9);
      onAddToVocab({
        id: newId,
        word: result.word,
        ipa: result.ipa,
        reading: result.reading, // Save reading (e.g. Furigana)
        meaningCn: result.cn,
        meaningRu: result.ru,
        contextSentence: '', 
        timestamp: Date.now()
      });
      
      setIsLookingUp(false);

      sfService.generateExample(result.word, settings.llmModel).then(example => {
         if (example) {
             onUpdateVocabEntry(newId, { contextSentence: example });
             setLookupData(prev => prev && prev.word === result.word ? { ...prev, example } : prev);
         }
      });

    } catch (error) {
      console.error(error);
      setLookupData({ word, ipa: '', cn: '查询失败', ru: '', example: '' });
      setIsLookingUp(false);
    }
  };

  const handleOCR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!settings.apiKey) {
      alert("请先在设置中配置 SiliconFlow API Key。");
      return;
    }

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result as string;
        const extractedText = await sfService.ocrImage(base64, settings.visionModel);
        setText(prev => prev + (prev ? '\n\n' : '') + extractedText);
      } catch (err) {
        alert("OCR 识别失败，请检查 API Key 或网络。");
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleTranslateOrReply = async () => {
    if (!text) return;
    if (!settings.apiKey) {
        alert("请先在设置中配置 SiliconFlow API Key。");
        return;
    }
    setIsProcessing(true);
    try {
      let res = "";
      if (detectedLang === 'zh') {
          // Context-aware reply generation
          res = await sfService.generateContextAwareReply(text, settings.llmModel);
      } else {
          // Standard translation
          res = await sfService.translateArticle(text, settings.llmModel);
      }
      setTranslation(res);

      // Save to History
      onAddToHistory({
          id: Date.now().toString(),
          original: text,
          translation: res,
          type: detectedLang === 'zh' ? 'reply' : 'translation',
          timestamp: Date.now()
      });

    } catch (e) {
      alert("处理失败，请检查网络或 Key。");
    } finally {
      setIsProcessing(false);
    }
  };

  const playAudio = async () => {
    if (!text) return;
    setIsPlaying(true);

    // Clear previous download URL if any to avoid confusion
    if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
    }

    try {
        let audioBuffer: ArrayBuffer | null = null;

        if (settings.ttsProvider === 'siliconflow') {
            if (!settings.apiKey) throw new Error("请配置 SiliconFlow API Key");
            if (!settings.sfTtsVoice) throw new Error("请选择语音音色");
            
            audioBuffer = await sfService.generateSpeech(
                text.substring(0, 4000), 
                settings.sfTtsModel,
                settings.sfTtsVoice,
                settings.ttsSpeed
            );

        } else if (settings.ttsProvider === 'azure') {
            if (!settings.azureKey || !settings.azureRegion) throw new Error("请配置 Azure Key 和 Region");
            
            const voice = settings.azureVoice || 'en-US-AvaMultilingualNeural';

            const azureService = new AzureTTSService(settings.azureKey, settings.azureRegion);
            audioBuffer = await azureService.generateSpeech(
                text.substring(0, 4000),
                voice,
                settings.ttsSpeed
            );

        } else {
            // Browser TTS
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.rate = settings.ttsSpeed;
                const voices = window.speechSynthesis.getVoices();
                const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Microsoft'))) || voices[0];
                if (preferredVoice) utterance.voice = preferredVoice;

                utterance.onend = () => setIsPlaying(false);
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
                return; 
            } else {
                throw new Error("浏览器不支持本地 TTS");
            }
        }

        if (audioBuffer) {
            const blob = new Blob([audioBuffer], { type: 'audio/mp3' });
            const url = URL.createObjectURL(blob);
            setAudioUrl(url); // Save URL for download
            
            if (audioRef.current) {
                audioRef.current.pause();
            }
            audioRef.current = new Audio(url);
            audioRef.current.onended = () => setIsPlaying(false);
            audioRef.current.play();
        }

    } catch (err: any) {
        console.error(err);
        alert(`语音播放失败: ${err.message}`);
        setIsPlaying(false);
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
        audioRef.current.pause();
    }
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  };

  const handleVoiceChange = (val: string) => {
      if (settings.ttsProvider === 'siliconflow') {
          onSettingsChange({ ...settings, sfTtsVoice: val });
      } else {
          onSettingsChange({ ...settings, azureVoice: val });
      }
  };

  const currentVoice = settings.ttsProvider === 'siliconflow' ? settings.sfTtsVoice : settings.azureVoice;

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] p-4 md:p-6 gap-6 pb-40">
      
      {/* Top Action Bar */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl p-4 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white dark:border-white/5 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between z-10 sticky top-4 md:relative">
        <div className="flex flex-wrap items-center gap-3">
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 md:flex-none group flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-2xl text-sm font-medium transition-all duration-200"
                disabled={isProcessing}
            >
                <div className="p-1.5 bg-white dark:bg-gray-600 rounded-lg shadow-sm text-blue-500 group-hover:scale-110 transition-transform">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                </div>
                识别图片 (OCR)
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleOCR} 
            />
            
            <button 
                onClick={handleTranslateOrReply}
                className={`flex-1 md:flex-none group flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 ${
                    detectedLang === 'zh'
                    ? 'bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                    : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
                }`}
                disabled={isProcessing || !text}
            >
                <div className={`p-1.5 rounded-lg shadow-sm transition-transform group-hover:scale-110 ${
                    detectedLang === 'zh' 
                    ? 'bg-purple-100 dark:bg-purple-800 text-purple-600 dark:text-purple-200'
                    : 'bg-white dark:bg-gray-600 text-purple-500'
                }`}>
                    {detectedLang === 'zh' ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                    ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"></path></svg>
                    )}
                </div>
                {detectedLang === 'zh' ? '✨ 生成俄语回复' : '全文翻译'}
            </button>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
            {isPlaying ? (
                <button 
                    onClick={stopAudio}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg shadow-red-200 text-sm font-medium transition-all transform active:scale-95"
                >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                    停止朗读
                </button>
            ) : (
                <button 
                    onClick={playAudio}
                    disabled={!text}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-black rounded-full shadow-lg shadow-gray-200 dark:shadow-none text-sm font-medium transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    开始跟读 ({settings.ttsSpeed}x)
                </button>
            )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col gap-6 flex-1 min-h-0">
        
        {/* Source Text Area */}
        <div className="relative flex flex-col min-h-[40vh] md:min-h-[400px] bg-white dark:bg-[#1c1c1e] rounded-3xl shadow-[0_2px_15px_rgb(0,0,0,0.02)] border border-gray-100 dark:border-white/10 overflow-hidden transition-colors">
            <div className="px-6 py-3 border-b border-gray-50 dark:border-white/5 flex justify-between items-center bg-gray-50/30 dark:bg-white/5">
                <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    原文 (自动检测: {detectedLang === 'zh' ? '中文' : detectedLang === 'ru' ? '俄语' : detectedLang === 'ja' ? '日语' : '其他'})
                </label>
                <span className="text-xs text-gray-400 dark:text-gray-500 hidden md:inline">选中文本即可查词</span>
            </div>
            <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onTouchMove={handleTouchMove} // Track scrolling
                onMouseUp={handleSelection}   // Handle selection end
                onTouchEnd={handleSelection}  // Handle touch end (iOS)
                placeholder="在此粘贴文章，或点击上方按钮识别图片..."
                className="flex-1 w-full p-6 outline-none resize-none bg-transparent leading-relaxed text-lg text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 font-normal"
            />
            {isProcessing && (
                 <div className="absolute inset-0 bg-white/60 dark:bg-black/60 flex items-center justify-center backdrop-blur-sm z-20">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">处理中...</span>
                    </div>
                 </div>
            )}
        </div>

        {/* Translation Area */}
        {translation && (
        <div className="flex flex-col min-h-[200px] bg-white dark:bg-[#1c1c1e] rounded-3xl shadow-[0_2px_15px_rgb(0,0,0,0.02)] border border-gray-100 dark:border-white/10 overflow-hidden transition-colors">
             <div className="px-6 py-3 border-b border-gray-50 dark:border-white/5 bg-gray-50/30 dark:bg-white/5 flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    {detectedLang === 'zh' ? '回复结果 / 俄语' : '中文翻译'}
                </label>
                <button 
                    onClick={() => {
                        // Copy to clipboard
                        navigator.clipboard.writeText(translation);
                        alert("已复制到剪贴板");
                    }}
                    className="text-xs text-blue-500 hover:text-blue-600"
                >
                    复制
                </button>
            </div>
            <div className="flex-1 w-full p-6 leading-relaxed text-lg text-gray-700 dark:text-gray-200 bg-gray-50/30 dark:bg-transparent">
                <div className="whitespace-pre-wrap">{translation}</div>
            </div>
        </div>
        )}
      </div>

      {/* Floating Control Panel (Bottom) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl border-t border-gray-200 dark:border-white/10 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] z-40 shadow-[0_-5px_20px_rgb(0,0,0,0.05)] transition-colors">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-4 md:gap-8 items-center justify-between">
            
            {/* Voice Selection */}
            <div className="w-full md:w-1/3 flex items-end gap-3">
                <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                        当前音色 ({settings.ttsProvider === 'azure' ? 'Azure' : settings.ttsProvider === 'siliconflow' ? 'CosyVoice' : '本地'})
                    </label>
                    {settings.ttsProvider === 'browser' ? (
                         <div className="text-sm text-gray-500 dark:text-gray-400">使用浏览器默认音色</div>
                    ) : (
                        <select 
                            value={currentVoice}
                            onChange={(e) => handleVoiceChange(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 border-transparent rounded-xl text-sm font-medium text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-gray-700 transition-all appearance-none"
                        >
                            {settings.ttsProvider === 'siliconflow' && !COSY_VOICES.some(v => v.value === currentVoice) && (
                                <option value="">请选择音色...</option>
                            )}
                            {availableVoices.map((v) => (
                                <option key={v.value} value={v.value}>{v.label}</option>
                            ))}
                        </select>
                    )}
                </div>

                {audioUrl && (
                    <a 
                        href={audioUrl} 
                        download={`polyglot-audio-${Date.now()}.mp3`}
                        className="flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl transition-colors mb-0.5"
                        title="下载生成的音频"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    </a>
                )}
            </div>

            {/* Speed Slider */}
            <div className="w-full md:w-1/2 flex flex-col gap-2">
                 <div className="flex justify-between text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    <span>慢速</span>
                    <span>语速: {settings.ttsSpeed}x</span>
                    <span>快速</span>
                 </div>
                 <input 
                    type="range" 
                    min="0.5" 
                    max="1.5" 
                    step="0.05" 
                    value={settings.ttsSpeed}
                    onChange={(e) => onSettingsChange({ ...settings, ttsSpeed: parseFloat(e.target.value) })}
                    className="w-full accent-black dark:accent-white h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer" 
                 />
            </div>
        </div>
      </div>

      <WordDetailModal 
        data={lookupData} 
        isLoading={isLookingUp} 
        position={lookupPos} 
        onClose={() => setLookupPos(null)} 
      />
    </div>
  );
};