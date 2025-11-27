
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AppSettings, WordEntry, HistoryEntry, LookupResult, AnalysisResult } from '../types';
import { SiliconFlowService } from '../services/siliconFlow';
import { AzureTTSService, AZURE_VOICES } from '../services/azureTTS';
import { GoogleFreeTTS } from '../services/googleTTS';
import { WordDetailModal } from '../components/WordDetailModal';
import { useLocalStorage } from '../hooks/useLocalStorage';

const SF_VOICES = [
    { label: "Bella (女 - 英文/多语)", value: "FunAudioLLM/CosyVoice2-0.5B:bella" },
    { label: "Adam (男 - 英文/多语)", value: "FunAudioLLM/CosyVoice2-0.5B:adam" },
    { label: "Qian (女 - 中文)", value: "FunAudioLLM/CosyVoice2-0.5B:qian" },
    { label: "Meimei (女 - 中文)", value: "FunAudioLLM/CosyVoice2-0.5B:meimei" },
    { label: "Zhe (男 - 中文)", value: "FunAudioLLM/CosyVoice2-0.5B:zhe" },
];

// Ideal voices whitelist for Apple devices with Lang Codes
const IDEAL_VOICES: Record<string, Array<{name: string, label: string, langCode: string}>> = {
    'en': [
        { name: 'Daniel', label: '🇬🇧 Daniel (英音 - 推荐)', langCode: 'en-GB' },
        { name: 'Jamie', label: '🇬🇧 Jamie (英音 - 高音质)', langCode: 'en-GB' },
        { name: 'Serena', label: '🇬🇧 Serena (英音 - 高音质)', langCode: 'en-GB' },
        { name: 'Stephanie', label: '🇬🇧 Stephanie (英音 - 优化)', langCode: 'en-GB' },
        { name: 'Ava', label: '🇺🇸 Ava (美音 - 高音质)', langCode: 'en-US' },
        { name: 'Evan', label: '🇺🇸 Evan (美音 - 优化)', langCode: 'en-US' },
        { name: 'Zoe', label: '🇺🇸 Zoe (美音 - 高音质)', langCode: 'en-US' },
        { name: 'Joelle', label: '🇺🇸 Joelle (美音 - 优化)', langCode: 'en-US' },
    ],
    'zh': [
        { name: 'Yue', label: '🇨🇳 Yue (高音质)', langCode: 'zh-CN' },
        { name: 'Yun', label: '🇨🇳 Yun (高音质)', langCode: 'zh-CN' },
        { name: 'Ting-Ting', label: '🇨🇳 Ting-Ting (中文 - 优化)', langCode: 'zh-CN' },
    ],
    'ja': [
        { name: 'Kyoko', label: '🇯🇵 Kyoko (优化)', langCode: 'ja-JP' },
        { name: 'Hattori', label: '🇯🇵 Hattori (优化)', langCode: 'ja-JP' },
    ],
    'ru': [
        { name: 'Milena', label: '🇷🇺 Milena (优化)', langCode: 'ru-RU' },
        { name: 'Yuri', label: '🇷🇺 Yuri (优化)', langCode: 'ru-RU' },
    ]
};

const useBrowserVoices = () => {
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    useEffect(() => {
        const update = () => {
            setVoices(window.speechSynthesis.getVoices());
        };
        update();
        window.speechSynthesis.onvoiceschanged = update;
        return () => { window.speechSynthesis.onvoiceschanged = null; };
    }, []);
    return voices;
};

// Image Compression Helper
const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1024;
                const MAX_HEIGHT = 1024;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                
                // Compress to JPEG with 0.7 quality
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                resolve(compressedBase64);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

// Helper to split text into sentences
const splitTextIntoSentences = (text: string): string[] => {
    return text.match(/[^.!?。！？\n\r]+[.!?。！？\n\r]*|[\n\r]+/g) || [text];
};

interface Props {
  settings: AppSettings;
  onAddToVocab: (entry: WordEntry) => void;
  onUpdateVocabEntry: (id: string, updates: Partial<WordEntry>) => void;
  onSettingsChange: (settings: AppSettings) => void;
  onAddToHistory: (entry: HistoryEntry) => void;
}

export const ReaderView: React.FC<Props> = ({ settings, onAddToVocab, onUpdateVocabEntry, onSettingsChange, onAddToHistory }) => {
  // Persistence
  const [inputText, setInputText] = useLocalStorage("reader_text", "");
  const [translationResult, setTranslationResult] = useLocalStorage<{text: string, type: 'translation' | 'reply'} | null>("reader_translation_result", null);
  const [analysisResult, setAnalysisResult] = useLocalStorage<AnalysisResult | null>("reader_analysis_result", null);
  
  const [isReaderMode, setIsReaderMode] = useState(false);
  const [isBlindMode, setIsBlindMode] = useState(false);
  const [lookupData, setLookupData] = useState<LookupResult | null>(null);
  const [modalPosition, setModalPosition] = useState<{ x: number, y: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  
  // Play Modes
  const [playMode, setPlayMode] = useState<'all' | 'select' | 'continue'>('all');
  const [selRange, setSelRange] = useState({ start: 0, end: 0 });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const googleTTS = useRef(new GoogleFreeTTS());
  const browserVoices = useBrowserVoices();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Audio Cache (LRU - Max 10)
  const audioCache = useRef<Map<string, string>>(new Map());
  const isFetchingAudio = useRef(false);
  const isStoppedRef = useRef(false); // To break the shadowing loop
  const isScrolling = useRef(false);
  const lastSelectionRef = useRef<string>("");

  const sfService = useMemo(() => new SiliconFlowService(settings.apiKey), [settings.apiKey]);
  const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);

  // Clean up Object URLs
  useEffect(() => {
    return () => {
      stopTTS();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      for (const url of audioCache.current.values()) {
        URL.revokeObjectURL(url);
      }
      isFetchingAudio.current = false;
    };
  }, []);

  // Detect Language
  const detectedLang = useMemo(() => {
    const textSample = inputText.slice(0, 300);
    if (/[\u3040-\u30ff\u3400-\u4dbf]/.test(textSample)) return 'ja';
    if (/[а-яА-ЯЁё]/.test(textSample)) return 'ru';
    if (/[\u4e00-\u9fa5]/.test(textSample)) return 'zh';
    return 'en';
  }, [inputText]);

  // UI Voices Logic
  const uiVoices = useMemo(() => {
    if (settings.ttsProvider !== 'browser') return [];

    let langKey = 'en';
    if (detectedLang === 'zh') langKey = 'zh';
    else if (detectedLang === 'ja') langKey = 'ja';
    else if (detectedLang === 'ru') langKey = 'ru';

    if (isAndroid) {
        const langVoices = browserVoices.filter(v => v.lang.startsWith(langKey));
        return langVoices.sort((a, b) => {
            const aHQ = a.name.includes('Network') || a.name.includes('Online') || a.name.includes('Google');
            const bHQ = b.name.includes('Network') || b.name.includes('Online') || b.name.includes('Google');
            return Number(bHQ) - Number(aHQ);
        }).map(v => ({
            value: v.voiceURI,
            label: v.name
        }));
    }

    const ideals = IDEAL_VOICES[langKey] || [];
    const result: Array<{value: string, label: string, disabled?: boolean}> = [];

    ideals.forEach(ideal => {
        const found = browserVoices.find(v => v.name.includes(ideal.name));
        if (found) {
            result.push({ value: found.voiceURI, label: ideal.label });
        } else {
            result.push({ value: `missing:${ideal.name}`, label: `${ideal.label} (需下载)`, disabled: false });
        }
    });

    if (ideals.length === 0) {
         const matches = browserVoices.filter(v => v.lang.startsWith(langKey));
         const premiums = matches.filter(v => v.name.includes('Premium') || v.name.includes('Enhanced'));
         (premiums.length > 0 ? premiums : matches).slice(0, 2).forEach(v => {
             result.push({ value: v.voiceURI, label: v.name });
         });
    }
    return result;
  }, [browserVoices, detectedLang, isAndroid, settings.ttsProvider]);


  const updatePlayMode = () => {
    if (!textareaRef.current) return;
    const { selectionStart, selectionEnd, value } = textareaRef.current;
    
    if (selectionEnd > selectionStart) {
        setPlayMode('select');
        setSelRange({ start: selectionStart, end: selectionEnd });
    } else if (selectionStart > 0 && selectionStart < value.length) {
        setPlayMode('continue');
        setSelRange({ start: selectionStart, end: value.length });
    } else {
        setPlayMode('all');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!settings.apiKey) { alert("请先在设置中配置 SiliconFlow API Key"); return; }

    setOcrLoading(true);
    try {
        const base64 = await compressImage(file);
        const text = await sfService.ocrImage(base64, settings.visionModel);
        setInputText(prev => prev + (prev ? "\n\n" : "") + text);
    } catch (err) {
        alert("OCR 识别失败，请检查图片或网络");
        console.error(err);
    } finally {
        setOcrLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const performLookup = async (text: string, x: number, y: number) => {
     if (!settings.apiKey) { alert("请先配置 API Key"); return; }
    
    const cleanWord = text.replace(/^[^\w\u0400-\u04FF\u4e00-\u9fa5]+|[^\w\u0400-\u04FF\u4e00-\u9fa5]+$/g, '');
    if (!cleanWord || cleanWord.length > 20) return;

    setModalPosition({ x, y });
    setLookupData({ word: cleanWord, ipa: '', cn: '查询中...', ru: '' });
    setIsLoading(true);

    try {
        const result = await sfService.lookupWordFast(cleanWord, settings.llmModel, detectedLang);
        setLookupData(result);

        const vocabId = Date.now().toString();
        const entry: WordEntry = {
            id: vocabId,
            word: result.word,
            reading: result.reading,
            ipa: result.ipa,
            meaningCn: result.cn,
            meaningRu: result.ru,
            timestamp: Date.now(),
            contextSentence: ""
        };
        onAddToVocab(entry);

        sfService.generateExample(cleanWord, settings.llmModel).then(ex => {
            if (ex) {
                setLookupData(prev => prev ? { ...prev, example: ex } : null);
                onUpdateVocabEntry(vocabId, { contextSentence: ex });
            }
        });
    } catch (err) {
        setLookupData(null);
    } finally {
        setIsLoading(false);
    }
  };

  const handleWordClick = async (e: React.MouseEvent<HTMLSpanElement>, word: string) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    let x = rect.left + window.scrollX;
    let y = rect.bottom + window.scrollY + 10;
    if (x + 320 > window.innerWidth) x = window.innerWidth - 340;
    performLookup(word, x, y);
  };

  // Audio Cache Helpers
  const getAudioFromCache = (key: string) => audioCache.current.get(key);
  const saveAudioToCache = (key: string, url: string) => {
      const cache = audioCache.current;
      if (cache.size >= 10) {
          const firstKey = cache.keys().next().value;
          if (firstKey) {
              URL.revokeObjectURL(cache.get(firstKey)!);
              cache.delete(firstKey);
          }
      }
      cache.set(key, url);
  };

  const stopTTS = () => {
    isStoppedRef.current = true;
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
    }
    googleTTS.current.stop();
    window.speechSynthesis.cancel();
    setTtsStatus('idle');
    isFetchingAudio.current = false;
  };

  const playOneSegment = async (text: string): Promise<void> => {
     if (!text.trim()) return;

     if (settings.ttsProvider === 'browser') {
        return new Promise((resolve, reject) => {
            const uttr = new SpeechSynthesisUtterance(text);
            uttr.rate = settings.ttsSpeed;
            
            let targetLang = detectedLang === 'zh' ? 'zh-CN' : detectedLang === 'ja' ? 'ja-JP' : detectedLang === 'ru' ? 'ru-RU' : 'en-US';
    
            if (settings.browserVoice) {
                const cleanName = settings.browserVoice.replace('missing:', '');
                const voice = browserVoices.find(v => v.voiceURI === settings.browserVoice || v.name.includes(cleanName));
                if (voice) {
                    uttr.voice = voice;
                    uttr.lang = voice.lang;
                } else {
                    const ideal = Object.values(IDEAL_VOICES).flat().find(v => cleanName.includes(v.name));
                    if (ideal) targetLang = ideal.langCode;
                    uttr.lang = targetLang;
                }
            } else {
                 uttr.lang = targetLang;
            }
            
            uttr.onend = () => resolve();
            uttr.onerror = (e) => reject(e);
            window.speechSynthesis.speak(uttr);
        });
     }
     
     if (settings.ttsProvider === 'google') {
        let lang = 'en';
        if (detectedLang === 'zh') lang = 'zh-CN';
        else if (detectedLang === 'ja') lang = 'ja';
        else if (detectedLang === 'ru') lang = 'ru';
        
        return new Promise((resolve) => {
             googleTTS.current.play(text, lang, 1.0, () => resolve());
        });
     }
     
     // API TTS
     const cacheKey = `${text}_${settings.ttsProvider}_${settings.sfTtsVoice}_${settings.azureVoice}_${settings.ttsSpeed}`;
     let url = getAudioFromCache(cacheKey);

     if (!url) {
        if (isFetchingAudio.current) return;
        isFetchingAudio.current = true;
        try {
            let audioData: ArrayBuffer;
            const fetchPromise = (async () => {
                 if (settings.ttsProvider === 'siliconflow') {
                    if (!settings.apiKey) throw new Error("缺少 Key");
                    return await sfService.generateSpeech(text, settings.sfTtsModel, settings.sfTtsVoice, settings.ttsSpeed);
                } else {
                    if (!settings.azureKey) throw new Error("缺少 Key");
                    const azure = new AzureTTSService(settings.azureKey, settings.azureRegion);
                    return await azure.generateSpeech(text, settings.azureVoice, settings.ttsSpeed);
                }
            })();
            
            const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("请求超时")), 15000));
            audioData = await Promise.race([fetchPromise, timeoutPromise]);
            
            const blob = new Blob([audioData], { type: 'audio/mp3' });
            url = URL.createObjectURL(blob);
            saveAudioToCache(cacheKey, url);
        } catch(err: any) {
            isFetchingAudio.current = false;
             if (err.message === "Azure_429") alert("请求过于频繁 (Azure 限制)，请稍后再试");
             else alert(err.message || "TTS Error");
             throw err;
        } finally {
            isFetchingAudio.current = false;
        }
     }
     
     if (url) {
         setAudioUrl(url);
         return new Promise((resolve, reject) => {
             const audio = new Audio(url);
             audioRef.current = audio;
             audio.onended = () => resolve();
             audio.onerror = () => reject();
             audio.play().catch(reject);
         });
     }
  };

  const handleTTS = async () => {
    if (!inputText.trim()) return;
    
    let textToPlay = inputText;
    if (playMode === 'select' || playMode === 'continue') {
        const start = selRange.start;
        const end = selRange.end > start ? selRange.end : inputText.length;
        const segment = inputText.slice(start, end).trim();
        if (segment) textToPlay = segment;
        else setPlayMode('all'); 
    }

    stopTTS();
    isStoppedRef.current = false;
    setTtsStatus(settings.shadowingMode ? 'playing' : 'loading');

    // REFACTORED SHADOWING MODE LOOP
    if (settings.shadowingMode) {
        setTtsStatus('playing');
        const sentences = splitTextIntoSentences(textToPlay);
        
        for (const sentence of sentences) {
            if (isStoppedRef.current) break;
            if (!sentence.trim()) continue;

            try {
                // 1. Play Sentence
                await playOneSegment(sentence);
                
                if (isStoppedRef.current) break;

                // 2. Pause for Shadowing
                await new Promise(resolve => {
                    setTimeout(resolve, settings.shadowingPause * 1000);
                });

            } catch (err) {
                console.error("Playback error", err);
                break;
            }
        }
        setTtsStatus('idle');
    } 
    else {
        try {
            await playOneSegment(textToPlay);
        } catch (e) {
             // Handled internally
        }
        setTtsStatus('idle');
    }
  };

  const handleTranslateOrReply = async () => {
    if (!inputText.trim()) { alert("请先输入内容"); return; }
    if (!settings.apiKey) { alert("请配置 API Key"); return; }

    setIsTranslating(true);
    setTranslationResult(null);
    const hasChinese = /[\u4e00-\u9fa5]/.test(inputText);
    
    try {
        let result = "";
        let type: 'translation' | 'reply' = 'translation';

        if (hasChinese) {
            result = await sfService.generateContextAwareReply(inputText, settings.llmModel);
            type = 'reply';
        } else {
            result = await sfService.translateArticle(inputText, settings.llmModel);
        }
        
        onAddToHistory({
            id: Date.now().toString(),
            original: inputText,
            translation: result,
            type: type,
            timestamp: Date.now()
        });
        setTranslationResult({ text: result, type });
    } catch (err) {
        alert("请求失败，请检查网络或 API Key");
    } finally {
        setIsTranslating(false);
    }
  };

  const handleAnalyze = async () => {
    if (!inputText.trim()) { alert("请先输入内容"); return; }
    if (!settings.apiKey) { alert("请配置 API Key"); return; }

    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
        const result = await sfService.analyzeText(inputText, settings.llmModel);
        setAnalysisResult(result);
    } catch (err) {
        alert("分析失败");
    } finally {
        setIsAnalyzing(false);
    }
  };

  const addAnalysisItemToVocab = (item: {text: string, cn: string}) => {
      onAddToVocab({
          id: Date.now().toString(),
          word: item.text,
          meaningCn: item.cn,
          meaningRu: '',
          timestamp: Date.now()
      });
      alert(`已添加: ${item.text}`);
  };

  const renderReaderContent = () => {
    if (!inputText) return <div className="text-gray-400 mt-10 text-center">在此粘贴文章，开始跟读...</div>;
    return inputText.split(/\n+/).map((para, pIdx) => (
        <p key={pIdx} className="mb-4 leading-relaxed text-lg text-gray-800 dark:text-gray-200">
            {para.split(/(\s+|[.,!?;:()（）"。！？])/).map((chunk, cIdx) => {
                if (!chunk.trim() || /^[.,!?;:()（）"。！？]+$/.test(chunk)) return <span key={cIdx}>{chunk}</span>;
                return (
                    <span 
                        key={cIdx} 
                        onClick={(e) => handleWordClick(e, chunk)}
                        className="cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-700 dark:hover:text-blue-300 rounded px-0.5 transition-colors"
                    >
                        {chunk}
                    </span>
                );
            })}
        </p>
    ));
  };

  const handleVoiceChange = (val: string) => {
    if (val.startsWith('missing:')) {
        if (isAndroid) setShowAndroidGuide(true);
        else setShowIosGuide(true);
    }
    
    if (settings.ttsProvider === 'siliconflow') onSettingsChange({ ...settings, sfTtsVoice: val });
    else if (settings.ttsProvider === 'azure') onSettingsChange({ ...settings, azureVoice: val });
    else onSettingsChange({ ...settings, browserVoice: val });
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] max-w-5xl mx-auto relative pb-20" onClick={() => setModalPosition(null)}>
        {/* Top Toolbar */}
        <div className="flex-none p-4 md:p-6 pb-2">
            <div className="flex items-center justify-between bg-white dark:bg-[#1c1c1e] p-2 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 overflow-x-auto scrollbar-hide">
                 <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setIsReaderMode(!isReaderMode)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap ${isReaderMode ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
                    >
                        {isReaderMode ? '编辑' : '查词'}
                    </button>

                    <button
                        onClick={() => setIsBlindMode(!isBlindMode)}
                        className={`p-2 rounded-xl flex-none transition-colors flex items-center gap-1.5 ${
                            isBlindMode 
                            ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-black' 
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                        title={isBlindMode ? "关闭盲听" : "开启盲听"}
                    >
                        {isBlindMode ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                        )}
                        <span className="text-xs font-bold hidden md:inline">盲听</span>
                    </button>
                    
                    <button
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        className={`p-2 rounded-xl flex-none transition-colors flex items-center gap-1.5 ${
                             isAnalyzing ? 'bg-gray-100 dark:bg-gray-800 text-gray-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                    >
                         {isAnalyzing ? <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : 
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>}
                         <span className="text-xs font-bold hidden md:inline">AI 分析</span>
                    </button>
                    
                    <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={ocrLoading}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg flex-none"
                    >
                        {ocrLoading ? <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : 
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>}
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                 </div>
                 
                 <button 
                    onClick={handleTranslateOrReply}
                    disabled={isTranslating}
                    className={`ml-2 px-4 py-2 text-sm font-bold rounded-xl transition-all shadow-sm whitespace-nowrap ${
                        /[\u4e00-\u9fa5]/.test(inputText) 
                        ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300 border border-purple-100 dark:border-purple-500/20' 
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                >
                    {isTranslating ? '生成中...' : (
                        /[\u4e00-\u9fa5]/.test(inputText) ? '✨ 生成俄语回复' : '全文翻译'
                    )}
                </button>
            </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-none mx-4 md:mx-6 mb-2 bg-white dark:bg-[#1c1c1e] rounded-3xl shadow-[0_2px_15px_rgb(0,0,0,0.02)] border border-gray-100 dark:border-white/10 overflow-hidden relative min-h-[300px]">
            <div className={`w-full h-full transition-all duration-500 ${isBlindMode ? 'blur-md opacity-60' : ''}`}>
                {isReaderMode ? (
                    <div 
                        className="absolute inset-0 overflow-y-auto p-6 md:p-8 scrollbar-hide text-lg md:text-xl"
                        onTouchStart={() => isScrolling.current = false}
                        onTouchMove={() => isScrolling.current = true}
                    >
                        {renderReaderContent()}
                    </div>
                ) : (
                    <textarea
                        ref={textareaRef}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onSelect={updatePlayMode}
                        onClick={updatePlayMode}
                        onKeyUp={updatePlayMode}
                        onTouchStart={() => isScrolling.current = false}
                        onTouchMove={() => isScrolling.current = true}
                        placeholder="在此输入或粘贴文章..."
                        className="w-full h-full min-h-[300px] p-6 md:p-8 resize-none focus:outline-none bg-transparent text-lg md:text-xl text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-700"
                    />
                )}
            </div>
            {/* Modal is strictly NOT blurred */}
            <WordDetailModal data={lookupData} isLoading={isLoading} onClose={() => setModalPosition(null)} position={modalPosition} />
        </div>

        {/* AI Analysis Result */}
        {analysisResult && (
             <div className="flex-none mx-4 md:mx-6 mb-4 p-6 bg-blue-50/50 dark:bg-blue-900/10 rounded-3xl shadow-sm border border-blue-100 dark:border-blue-500/20 relative animate-in fade-in slide-in-from-top-2">
                 <button onClick={() => setAnalysisResult(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                 </button>
                 <h3 className="text-sm font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wide mb-4">AI 智能分析</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div>
                         <h4 className="text-xs font-bold text-gray-500 mb-2">常用搭配 / 词块</h4>
                         <div className="space-y-2">
                             {analysisResult.collocations.map((item, idx) => (
                                 <div key={idx} className="flex items-center justify-between bg-white dark:bg-black/20 p-2 rounded-lg border border-blue-100 dark:border-white/5">
                                     <div>
                                         <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">{item.text}</div>
                                         <div className="text-xs text-gray-500">{item.cn}</div>
                                     </div>
                                     <button onClick={() => addAnalysisItemToVocab(item)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-full">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                                     </button>
                                 </div>
                             ))}
                         </div>
                     </div>
                     <div>
                         <h4 className="text-xs font-bold text-gray-500 mb-2">核心词汇 (B2/C1)</h4>
                         <div className="space-y-2">
                             {analysisResult.vocabulary.map((item, idx) => (
                                 <div key={idx} className="flex items-center justify-between bg-white dark:bg-black/20 p-2 rounded-lg border border-purple-100 dark:border-white/5">
                                     <div>
                                         <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">{item.text}</div>
                                         <div className="text-xs text-gray-500">{item.cn}</div>
                                     </div>
                                     <button onClick={() => addAnalysisItemToVocab(item)} className="p-1.5 text-purple-500 hover:bg-purple-50 rounded-full">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                                     </button>
                                 </div>
                             ))}
                         </div>
                     </div>
                 </div>
             </div>
        )}

        {/* Translation/Reply Result Section */}
        {translationResult && (
            <div className="flex-none mx-4 md:mx-6 mb-6 p-6 bg-white dark:bg-[#1c1c1e] rounded-3xl shadow-sm border border-purple-100 dark:border-purple-500/20 relative animate-in slide-in-from-top-2 fade-in duration-300">
                <button 
                    onClick={() => setTranslationResult(null)}
                    className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <div className="flex items-center gap-2 mb-4">
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg uppercase tracking-wide ${
                        translationResult.type === 'reply' 
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    }`}>
                        {translationResult.type === 'reply' ? '智能回复' : '翻译结果'}
                    </span>
                </div>
                <div className="text-lg leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                    {translationResult.text}
                </div>
                <div className="mt-4 flex justify-end">
                    <button 
                        onClick={() => {
                            navigator.clipboard.writeText(translationResult.text);
                            alert("已复制");
                        }}
                        className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white flex items-center gap-1.5 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        复制内容
                    </button>
                </div>
            </div>
        )}

        {/* Bottom Control Bar */}
        <div className="flex-none p-4 md:p-6 pt-2 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
             <div className="bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-gray-200/50 dark:border-white/10 flex items-center justify-between gap-4">
                {/* Play Button */}
                <button 
                    onClick={ttsStatus === 'playing' ? stopTTS : handleTTS}
                    disabled={ttsStatus === 'loading'}
                    className={`flex-none w-12 h-12 flex items-center justify-center rounded-full shadow-md transition-all ${
                        ttsStatus === 'loading' ? 'bg-gray-200 dark:bg-gray-700' : 'bg-black dark:bg-white text-white dark:text-black hover:scale-105 active:scale-95'
                    }`}
                >
                    {ttsStatus === 'loading' ? (
                        <svg className="animate-spin w-5 h-5 text-gray-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : ttsStatus === 'playing' ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>
                    ) : (
                        <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
                    )}
                </button>

                {/* Status & Mode Text */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                            {playMode === 'select' ? '播放选中' : playMode === 'continue' ? '从光标处播放' : '全文跟读'}
                        </span>
                        {settings.shadowingMode && (
                             <span className="text-[10px] font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded">
                                跟读中
                             </span>
                        )}
                    </div>
                    
                    {/* Voice Selector */}
                    <div className="flex items-center gap-2">
                        {settings.ttsProvider === 'google' ? (
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Google 默认音色</span>
                        ) : (
                            <div className="relative flex-1">
                                <select
                                    value={
                                        settings.ttsProvider === 'siliconflow' ? settings.sfTtsVoice :
                                        settings.ttsProvider === 'azure' ? settings.azureVoice :
                                        settings.browserVoice
                                    }
                                    onChange={(e) => handleVoiceChange(e.target.value)}
                                    className="w-full bg-transparent border-none p-0 pr-8 text-sm font-semibold text-gray-800 dark:text-gray-200 focus:ring-0 cursor-pointer truncate"
                                >
                                    {settings.ttsProvider === 'siliconflow' && SF_VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                                    {settings.ttsProvider === 'azure' && AZURE_VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                                    {settings.ttsProvider === 'browser' && uiVoices.map(v => (
                                        <option key={v.value} value={v.value} disabled={v.disabled} className={v.value.startsWith('missing:') ? 'text-gray-400' : ''}>
                                            {v.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {/* Help Button for Browser TTS */}
                        {settings.ttsProvider === 'browser' && (
                            <button onClick={() => isAndroid ? setShowAndroidGuide(true) : setShowIosGuide(true)} className="text-blue-500">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Speed Slider or Disabled Tag */}
                {settings.ttsProvider === 'google' ? (
                    <div className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-1 rounded">不可调速</div>
                ) : (
                    <div className="flex flex-col items-end w-24">
                        <span className="text-[10px] font-mono text-gray-500 mb-1">{settings.ttsSpeed.toFixed(1)}x</span>
                        <input 
                            type="range" min="0.5" max="1.5" step="0.1"
                            value={settings.ttsSpeed}
                            onChange={(e) => onSettingsChange({ ...settings, ttsSpeed: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-black dark:accent-white"
                        />
                    </div>
                )}
                
                {/* Download Button (Only for Azure/SF) */}
                {audioUrl && settings.ttsProvider !== 'browser' && settings.ttsProvider !== 'google' && (
                    <a 
                        href={audioUrl} 
                        download={`audio_${Date.now()}.mp3`}
                        className="p-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    </a>
                )}
             </div>
             
             {playMode === 'select' && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-black/75 text-white text-xs px-3 py-1 rounded-full backdrop-blur pointer-events-none animate-in fade-in slide-in-from-bottom-2">
                    ✨ 保持选中可循环练习
                </div>
             )}
        </div>

        {/* iOS Guide Modal */}
        {showIosGuide && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm" onClick={() => setShowIosGuide(false)}>
                <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-[#1c1c1e] p-6 rounded-3xl max-w-sm w-full shadow-2xl border border-white/10">
                    <h3 className="text-lg font-bold mb-4 text-black dark:text-white">如何开启高音质?</h3>
                    <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
                        <p>iOS 系统包含顶级的 Neural 语音包 (如 Daniel, TingTing 增强版)，但默认不开启。</p>
                        <ol className="list-decimal list-inside space-y-2 marker:text-blue-500">
                            <li>打开 <strong>设置</strong> → <strong>辅助功能</strong></li>
                            <li>点击 <strong>朗读内容</strong> → <strong>声音</strong></li>
                            <li>选择对应语言 (如 英语 → 英语(英国))</li>
                            <li>下载 <strong>Enhanced/Premium (优化/高音质)</strong> 版本</li>
                        </ol>
                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-green-700 dark:text-green-300 text-xs">
                            配置完成后，回到本页面<strong>刷新</strong>，即可在下拉菜单中选择刚刚下载的高级音色！
                        </div>
                    </div>
                    <button onClick={() => setShowIosGuide(false)} className="mt-6 w-full py-3 bg-black dark:bg-white text-white dark:text-black rounded-xl font-bold">
                        明白了
                    </button>
                </div>
            </div>
        )}

        {/* Android Guide Modal */}
        {showAndroidGuide && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm" onClick={() => setShowAndroidGuide(false)}>
                <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-[#1c1c1e] p-6 rounded-3xl max-w-sm w-full shadow-2xl border border-white/10">
                    <h3 className="text-lg font-bold mb-4 text-black dark:text-white">Android 音质优化</h3>
                    <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
                        <p>建议使用 Google 官方语音服务以获得最佳体验。</p>
                        <ol className="list-decimal list-inside space-y-2 marker:text-green-500">
                            <li>打开 <strong>设置</strong> → <strong>无障碍/辅助功能</strong></li>
                            <li>点击 <strong>文本转语音 (TTS) 输出</strong></li>
                            <li>首选引擎选择 <strong>Speech Services by Google</strong></li>
                            <li>点击齿轮图标 → 安装语音数据 → 下载对应语言包</li>
                        </ol>
                        <div className="mt-4 text-xs text-gray-500">
                            提示: Android 音色列表中的 "Network" 或 "Online" 通常代表更高音质。
                        </div>
                    </div>
                    <button onClick={() => setShowAndroidGuide(false)} className="mt-6 w-full py-3 bg-black dark:bg-white text-white dark:text-black rounded-xl font-bold">
                        明白了
                    </button>
                </div>
            </div>
        )}
    </div>
  );
};
