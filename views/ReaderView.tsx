import React, { useState, useRef, useEffect } from 'react';
import { AppSettings, WordEntry, LookupResult } from '../types';
import { SiliconFlowService } from '../services/siliconFlow';
import { AzureTTSService } from '../services/azureTTS';
import { WordDetailModal } from '../components/WordDetailModal';

interface Props {
  settings: AppSettings;
  onAddToVocab: (entry: WordEntry) => void;
  onUpdateVocabEntry: (id: string, updates: Partial<WordEntry>) => void;
}

export const ReaderView: React.FC<Props> = ({ settings, onAddToVocab, onUpdateVocabEntry }) => {
  const [text, setText] = useState('');
  const [translation, setTranslation] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lookupPos, setLookupPos] = useState<{ x: number, y: number } | null>(null);
  const [lookupData, setLookupData] = useState<LookupResult | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sfService = new SiliconFlowService(settings.apiKey);

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  const onMouseUp = (e: React.MouseEvent<HTMLTextAreaElement> | React.TouchEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    setTimeout(() => {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end).trim();

        if (selectedText.length > 0 && selectedText.length < 50) {
            // Adjust position
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
      // 1. Fast Lookup (Definition Only)
      const result = await sfService.lookupWordFast(word, settings.llmModel);
      
      // Update UI immediately
      setLookupData(result);
      
      // Generate a truly unique ID to prevent collision bugs when adding words quickly
      const newId = Date.now().toString() + "-" + Math.random().toString(36).substring(2, 9);
      
      // 2. Add to Vocab immediately (without example)
      onAddToVocab({
        id: newId,
        word: result.word,
        ipa: result.ipa,
        meaningCn: result.cn,
        meaningRu: result.ru,
        contextSentence: '', // Placeholder
        timestamp: Date.now()
      });
      
      setIsLookingUp(false); // Stop loading indicator on UI

      // 3. Async: Generate Example in background
      sfService.generateExample(result.word, settings.llmModel).then(example => {
         if (example) {
             onUpdateVocabEntry(newId, { contextSentence: example });
             // Update local modal data if still open
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

  const handleTranslate = async () => {
    if (!text) return;
    if (!settings.apiKey) {
        alert("请先在设置中配置 SiliconFlow API Key。");
        return;
    }
    setIsProcessing(true);
    try {
      const res = await sfService.translateArticle(text, settings.llmModel);
      setTranslation(res);
    } catch (e) {
      alert("翻译失败。");
    } finally {
      setIsProcessing(false);
    }
  };

  const playAudio = async () => {
    if (!text) return;
    setIsPlaying(true);

    try {
        let audioBuffer: ArrayBuffer | null = null;

        if (settings.ttsProvider === 'siliconflow') {
            // --- SiliconFlow TTS ---
            if (!settings.apiKey) throw new Error("请配置 SiliconFlow API Key");
            if (!settings.sfTtsVoice) throw new Error("请选择语音音色");
            
            audioBuffer = await sfService.generateSpeech(
                text.substring(0, 4000), 
                settings.sfTtsModel,
                settings.sfTtsVoice,
                settings.ttsSpeed
            );

        } else if (settings.ttsProvider === 'azure') {
            // --- Azure TTS ---
            if (!settings.azureKey || !settings.azureRegion) throw new Error("请配置 Azure Key 和 Region");
            const azureService = new AzureTTSService(settings.azureKey, settings.azureRegion);
            audioBuffer = await azureService.generateSpeech(
                text.substring(0, 4000),
                settings.azureVoice || 'en-US-AvaMultilingualNeural',
                settings.ttsSpeed
            );

        } else {
            // --- Browser TTS ---
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.rate = settings.ttsSpeed;
                const voices = window.speechSynthesis.getVoices();
                const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Microsoft'))) || voices[0];
                if (preferredVoice) utterance.voice = preferredVoice;

                utterance.onend = () => setIsPlaying(false);
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
                return; // Browser TTS handles playback itself
            } else {
                throw new Error("浏览器不支持本地 TTS");
            }
        }

        // Play Audio Buffer (SiliconFlow / Azure)
        if (audioBuffer) {
            const blob = new Blob([audioBuffer], { type: 'audio/mp3' });
            const url = URL.createObjectURL(blob);
            
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
        audioRef.current = null;
    }
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] p-4 md:p-6 gap-6">
      
      {/* Control Bar */}
      <div className="bg-white/80 backdrop-blur-xl p-4 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between z-10 sticky top-4 md:relative">
        <div className="flex flex-wrap items-center gap-3">
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 md:flex-none group flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl text-sm font-medium transition-all duration-200"
                disabled={isProcessing}
            >
                <div className="p-1.5 bg-white rounded-lg shadow-sm text-blue-500 group-hover:scale-110 transition-transform">
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
                onClick={handleTranslate}
                className="flex-1 md:flex-none group flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl text-sm font-medium transition-all duration-200"
                disabled={isProcessing || !text}
            >
                <div className="p-1.5 bg-white rounded-lg shadow-sm text-purple-500 group-hover:scale-110 transition-transform">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"></path></svg>
                </div>
                全文翻译
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
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-black hover:bg-gray-800 text-white rounded-full shadow-lg shadow-gray-200 text-sm font-medium transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="relative flex flex-col min-h-[40vh] md:min-h-[400px] bg-white rounded-3xl shadow-[0_2px_15px_rgb(0,0,0,0.02)] border border-gray-100 overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">原文</label>
                <span className="text-xs text-gray-400 hidden md:inline">选中文本即可查词</span>
                <span className="text-xs text-gray-400 md:hidden">长按文本即可查词</span>
            </div>
            <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onMouseUp={onMouseUp}
                onTouchEnd={onMouseUp} 
                placeholder="在此粘贴文章，或点击上方按钮识别图片..."
                className="flex-1 w-full p-6 outline-none resize-none bg-transparent leading-relaxed text-lg text-gray-800 placeholder-gray-300 font-normal"
            />
            {isProcessing && (
                 <div className="absolute inset-0 bg-white/60 flex items-center justify-center backdrop-blur-sm z-20">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm font-medium text-gray-600">处理中...</span>
                    </div>
                 </div>
            )}
        </div>

        {/* Translation Area */}
        {translation && (
        <div className="flex flex-col min-h-[200px] bg-white rounded-3xl shadow-[0_2px_15px_rgb(0,0,0,0.02)] border border-gray-100 overflow-hidden">
             <div className="px-6 py-3 border-b border-gray-50 bg-gray-50/30">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">中文翻译</label>
            </div>
            <div className="flex-1 w-full p-6 leading-relaxed text-lg text-gray-700 bg-gray-50/30">
                <div className="whitespace-pre-wrap">{translation}</div>
            </div>
        </div>
        )}
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