
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AppSettings, WordEntry, LookupResult, HistoryEntry } from '../types';
import { SiliconFlowService } from '../services/siliconFlow';
import { AzureTTSService, AZURE_VOICES } from '../services/azureTTS';
import { GoogleFreeTTS } from '../services/googleTTS';
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

// Define user's preferred high-quality voices (Apple Ecosystem Specific)
const IDEAL_VOICES: Record<string, { name: string; label: string }[]> = {
    'en': [
        // UK
        { name: 'Daniel', label: '🇬🇧 Daniel (英国 - 优化)' },
        { name: 'Jamie', label: '🇬🇧 Jamie (英国 - 高音质)' },
        { name: 'Serena', label: '🇬🇧 Serena (英国 - 高音质)' },
        { name: 'Stephanie', label: '🇬🇧 Stephanie (英国 - 优化)' },
        // US
        { name: 'Ava', label: '🇺🇸 Ava (美国 - 高音质)' },
        { name: 'Evan', label: '🇺🇸 Evan (美国 - 优化)' },
        { name: 'Zoe', label: '🇺🇸 Zoe (美国 - 高音质)' },
        { name: 'Joelle', label: '🇺🇸 Joelle (美国 - 优化)' }
    ],
    'zh': [
        { name: 'Bin-yue', label: '🇨🇳 月 (高音质)' }, // Usually Bin-yue
        { name: 'Yun', label: '🇨🇳 Yun (高音质)' } // Matches Yun-yang/Yun-xi
    ],
    'ja': [
        { name: 'Kyoko', label: '🇯🇵 Kyoko (优化)' },
        { name: 'Hattori', label: '🇯🇵 Hattori (优化)' }
    ],
    'ru': [
        { name: 'Milena', label: '🇷🇺 Milena (优化)' },
        { name: 'Yuri', label: '🇷🇺 Yuri (优化)' }
    ]
};

export const ReaderView: React.FC<Props> = ({ settings, onAddToVocab, onUpdateVocabEntry, onSettingsChange, onAddToHistory }) => {
  // Persistence: Use local storage for text and translation so they survive tab switches
  const [text, setText] = useLocalStorage<string>('reader_text', '');
  const [translation, setTranslation] = useLocalStorage<string>('reader_translation', '');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // Separate state for audio loading to show spinner on play button
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  // Browser Voices State
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showVoiceGuide, setShowVoiceGuide] = useState(false);

  const [lookupPos, setLookupPos] = useState<{ x: number, y: number } | null>(null);
  const [lookupData, setLookupData] = useState<LookupResult | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  
  // Playback Mode State
  const [playMode, setPlayMode] = useState<'all' | 'select' | 'continue'>('all');
  const [selRange, setSelRange] = useState({ start: 0, end: 0 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const googleTTS = useRef(new GoogleFreeTTS());

  // LRU Audio Cache
  const audioCache = useRef<Map<string, string>>(new Map());

  // Request Lock to prevent concurrent Azure requests
  const isFetchingAudio = useRef(false);

  // BUG FIX: Refs to track scrolling and selection
  const isScrolling = useRef(false);
  const lastSelection = useRef<string>("");

  const sfService = new SiliconFlowService(settings.apiKey);

  // Detect Apple Ecosystem (Mac/iOS)
  const isApple = useMemo(() => /Mac|iPod|iPhone|iPad/.test(navigator.userAgent) || /Mac|iPod|iPhone|iPad/.test(navigator.platform), []);
  const isAndroid = useMemo(() => /Android/.test(navigator.userAgent), []);

  useEffect(() => {
    // Load Browser Voices
    const updateVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        setBrowserVoices(voices);
    };
    window.speechSynthesis.onvoiceschanged = updateVoices;
    updateVoices();

    return () => {
      stopAudio();
      isFetchingAudio.current = false; // Reset lock on unmount
      setIsAudioLoading(false);
      // Cleanup cache on unmount
      audioCache.current.forEach(url => URL.revokeObjectURL(url));
      audioCache.current.clear();
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // --- Auto-Detect Language & Recommend Voice ---
  const detectedLang = useMemo(() => {
    if (!text) return 'en';
    
    // Priority 1: Check for Japanese (Hiragana/Katakana) FIRST.
    if (/[\u3040-\u30ff\u3400-\u4dbf]/.test(text)) return 'ja';

    // Priority 2: Check for Chinese characters anywhere (if no Kana).
    // Ensure we don't misclassify pure Kanji as Chinese if context implies JP, 
    // but without explicit check, we assume ZH if no Kana.
    if (/[^\u3040-\u30ff\u3400-\u4dbf\u31f0-\u31ff\uff66-\uff9f][\u4e00-\u9fa5]/.test(text) || /^[\u4e00-\u9fa5]+$/.test(text)) return 'zh';

    // Priority 3: Check for Cyrillic (Russian)
    if (/[а-яА-ЯЁё]/.test(text)) return 'ru';

    // Default Latin
    return 'en';
  }, [text]);

  const availableVoices = useMemo(() => {
    if (settings.ttsProvider === 'azure') {
        if (detectedLang === 'ru') {
            return AZURE_VOICES.filter(v => v.value.startsWith('ru-RU'));
        }
        if (detectedLang === 'zh') {
            return AZURE_VOICES.filter(v => v.value.startsWith('zh-CN'));
        }
        if (detectedLang === 'ja') {
            return AZURE_VOICES.filter(v => v.value.startsWith('ja-JP'));
        }
        return AZURE_VOICES.filter(v => !v.value.startsWith('ru-RU') && !v.value.startsWith('zh-CN') && !v.value.startsWith('ja-JP'));
    }
    return COSY_VOICES;
  }, [settings.ttsProvider, detectedLang]);

  // Construct UI Voice List for Browser
  const uiVoices = useMemo(() => {
      const items: { label: string, value: string, missing?: boolean }[] = [];
      
      let targetLangKey = 'en';
      if (detectedLang === 'zh') targetLangKey = 'zh';
      if (detectedLang === 'ja') targetLangKey = 'ja';
      if (detectedLang === 'ru') targetLangKey = 'ru';

      // --- Apple Strategy (Mac & iOS): Strict Whitelist & Language Isolation ---
      if (isApple) {
          // STRICT: Only look for voices relevant to the detected language.
          // e.g., If Chinese is detected, ONLY show Chinese voices from the whitelist.
          const ideals = IDEAL_VOICES[targetLangKey];

          if (ideals) {
              ideals.forEach(ideal => {
                  const match = browserVoices.find(v => 
                      v.name.toLowerCase().includes(ideal.name.toLowerCase())
                  );

                  if (match) {
                      items.push({ 
                          label: ideal.label, 
                          value: match.voiceURI 
                      });
                  } else {
                      items.push({ 
                          label: `${ideal.label} (需下载)`, 
                          value: `missing:${ideal.name}`, 
                          missing: true 
                      });
                  }
              });
          } else {
              // Heuristic for languages NOT in the whitelist (e.g., French, Italian on Apple devices)
              // Strictly filter by lang prefix
              const prefix = detectedLang; 
              const rawFiltered = browserVoices.filter(v => v.lang.toLowerCase().startsWith(prefix));
              const highQuality = rawFiltered.filter(v => 
                  v.name.includes('Premium') || v.name.includes('Enhanced') || v.name.includes('Siri')
              );
              // Limit to top 2 to keep list clean
              const candidates = highQuality.length > 0 ? highQuality : rawFiltered;
              candidates.slice(0, 2).forEach(v => {
                  items.push({ label: v.name, value: v.voiceURI });
              });
          }
      } 
      // --- Android / Windows Strategy: Best Effort ---
      else {
          const prefix = detectedLang === 'zh' ? 'zh' : detectedLang === 'ja' ? 'ja' : detectedLang === 'ru' ? 'ru' : 'en';
          
          // Filter by language
          let rawFiltered = browserVoices.filter(v => v.lang.toLowerCase().startsWith(prefix));
          
          // Sort logic: Network/Google voices first, then local
          rawFiltered.sort((a, b) => {
              const scoreA = (a.name.includes('Network') || a.name.includes('Google') || a.name.includes('Online')) ? 1 : 0;
              const scoreB = (b.name.includes('Network') || b.name.includes('Google') || b.name.includes('Online')) ? 1 : 0;
              return scoreB - scoreA; // Descending
          });

          if (rawFiltered.length === 0) {
              items.push({ label: "未找到对应语言的本地音色", value: "", missing: true });
          } else {
              rawFiltered.forEach(v => {
                 items.push({ label: v.name, value: v.voiceURI });
              });
          }
      }

      return items;
  }, [browserVoices, detectedLang, isApple]);

  // Update Play Mode based on cursor position
  const updatePlayMode = () => {
    const el = textareaRef.current;
    if (!el) return;
    
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const len = el.value.length;
    
    setSelRange({ start, end });
    
    if (start !== end) {
        setPlayMode('select');
    } else if (start > 0 && start < len) {
        setPlayMode('continue');
    } else {
        setPlayMode('all');
    }
  };

  const handleTouchMove = () => {
      isScrolling.current = true;
  };

  const handleSelection = (e: React.MouseEvent<HTMLTextAreaElement> | React.TouchEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    updatePlayMode();

    if (isScrolling.current) {
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
      const result = await sfService.lookupWordFast(word, settings.llmModel, detectedLang);
      setLookupData(result);
      
      const newId = Date.now().toString() + "-" + Math.random().toString(36).substring(2, 9);
      onAddToVocab({
        id: newId,
        word: result.word,
        ipa: result.ipa,
        reading: result.reading, 
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
          res = await sfService.generateContextAwareReply(text, settings.llmModel);
      } else {
          res = await sfService.translateArticle(text, settings.llmModel);
      }
      setTranslation(res);
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

  const saveAudioToCache = (key: string, url: string) => {
      const cache = audioCache.current;
      if (cache.has(key)) {
          cache.delete(key);
      }
      if (cache.size >= 10) {
          const oldestKey = cache.keys().next().value;
          if (oldestKey) {
              const urlToRemove = cache.get(oldestKey);
              cache.delete(oldestKey);
              if (urlToRemove) URL.revokeObjectURL(urlToRemove);
          }
      }
      cache.set(key, url);
  };

  const playAudio = async () => {
    if (isFetchingAudio.current) {
        return; 
    }

    if (!text) return;
    
    // Determine Play Text
    const el = textareaRef.current;
    let textToPlay = text;

    if (el) {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const len = el.value.length;
        
        // Smart Playback Logic:
        // 1. If selection exists -> Play Selection
        // 2. If cursor in middle -> Play from cursor
        // 3. If cursor at end (or text after cursor is empty) -> Play ALL (Fallback)
        if (start !== end) {
             textToPlay = text.substring(start, end);
        } else if (start > 0 && start < len) {
             const tail = text.substring(start);
             if (tail.trim().length > 0) {
                 textToPlay = tail;
             }
        }
    }

    if (!textToPlay.trim()) {
        textToPlay = text;
    }

    stopAudio(); 
    setIsPlaying(true);
    setIsAudioLoading(true);

    const currentVoice = settings.ttsProvider === 'siliconflow' ? settings.sfTtsVoice : 
                         settings.ttsProvider === 'azure' ? settings.azureVoice :
                         settings.ttsProvider === 'browser' ? settings.browserVoice : '';

    const shouldCache = settings.ttsProvider === 'siliconflow' || settings.ttsProvider === 'azure';
    const cacheKey = shouldCache ? JSON.stringify({
        provider: settings.ttsProvider,
        voice: currentVoice,
        speed: settings.ttsSpeed,
        text: textToPlay
    }) : '';

    if (shouldCache && audioCache.current.has(cacheKey)) {
        console.log("Audio Cache Hit!");
        const cachedUrl = audioCache.current.get(cacheKey)!;
        audioCache.current.delete(cacheKey);
        audioCache.current.set(cacheKey, cachedUrl);
        setAudioUrl(cachedUrl);
        audioRef.current = new Audio(cachedUrl);
        audioRef.current.onended = () => { setIsPlaying(false); setIsAudioLoading(false); };
        audioRef.current.play();
        setIsAudioLoading(false);
        return;
    }

    const timeoutId = setTimeout(() => {
        if (isFetchingAudio.current) {
            isFetchingAudio.current = false;
            setIsAudioLoading(false);
            setIsPlaying(false);
            alert("请求超时。请检查网络或重试。");
        }
    }, 15000);

    try {
        isFetchingAudio.current = true;
        let audioBuffer: ArrayBuffer | null = null;

        if (settings.ttsProvider === 'google') {
            await googleTTS.current.play(textToPlay, detectedLang, 1.0, () => {
                setIsPlaying(false);
            });
            setIsAudioLoading(false);
        } else if (settings.ttsProvider === 'siliconflow') {
            if (!settings.apiKey) throw new Error("请配置 SiliconFlow API Key");
            if (!settings.sfTtsVoice) throw new Error("请选择语音音色");
            
            audioBuffer = await sfService.generateSpeech(
                textToPlay.substring(0, 4000), 
                settings.sfTtsModel,
                settings.sfTtsVoice,
                settings.ttsSpeed
            );

        } else if (settings.ttsProvider === 'azure') {
            if (!settings.azureKey || !settings.azureRegion) throw new Error("请配置 Azure Key 和 Region");
            
            const voice = settings.azureVoice || 'en-US-AvaMultilingualNeural';
            const azureService = new AzureTTSService(settings.azureKey, settings.azureRegion);
            audioBuffer = await azureService.generateSpeech(
                textToPlay.substring(0, 4000),
                voice,
                settings.ttsSpeed
            );

        } else {
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(textToPlay);
                utterance.rate = settings.ttsSpeed;
                
                // Default fallback lang
                let langCode = 'en-US';
                if (detectedLang === 'zh') langCode = 'zh-CN';
                if (detectedLang === 'ru') langCode = 'ru-RU';
                if (detectedLang === 'ja') langCode = 'ja-JP';
                utterance.lang = langCode;

                if (settings.browserVoice) {
                    const selectedVoice = window.speechSynthesis.getVoices().find(v => v.voiceURI === settings.browserVoice);
                    // FIXED: If user explicitly selected a voice, USE IT and USE ITS LANGUAGE.
                    // This prevents "Daniel (en-GB)" from being treated as "en-US" and falling back to default Samantha.
                    if (selectedVoice) {
                        utterance.voice = selectedVoice;
                        utterance.lang = selectedVoice.lang; // CRITICAL FIX
                    }
                }

                utterance.onend = () => setIsPlaying(false);
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
                setIsAudioLoading(false);
            } else {
                throw new Error("浏览器不支持本地 TTS");
            }
        }

        if (audioBuffer) {
            const blob = new Blob([audioBuffer], { type: 'audio/mp3' });
            const url = URL.createObjectURL(blob);
            
            if (shouldCache) saveAudioToCache(cacheKey, url);

            setAudioUrl(url); 
            
            audioRef.current = new Audio(url);
            audioRef.current.onended = () => { setIsPlaying(false); setIsAudioLoading(false); };
            await audioRef.current.play();
            setIsAudioLoading(false);
        }

    } catch (err: any) {
        console.error(err);
        if (err.message === 'Azure_429' || err.message.includes('429')) {
             alert("请求过于频繁 (Azure 限制)，请稍后再试。");
        } else {
             alert(`语音播放失败: ${err.message}`);
        }
        setIsPlaying(false);
        setIsAudioLoading(false);
    } finally {
        clearTimeout(timeoutId);
        isFetchingAudio.current = false;
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
    }
    window.speechSynthesis.cancel();
    googleTTS.current.stop();
    setIsPlaying(false);
    setIsAudioLoading(false);
  };

  const handleVoiceChange = (val: string) => {
      // Intercept clicks on "Missing" voices
      if (val.startsWith('missing:')) {
          setShowVoiceGuide(true);
          return;
      }

      if (settings.ttsProvider === 'siliconflow') {
          onSettingsChange({ ...settings, sfTtsVoice: val });
      } else if (settings.ttsProvider === 'azure') {
          onSettingsChange({ ...settings, azureVoice: val });
      } else if (settings.ttsProvider === 'browser') {
          onSettingsChange({ ...settings, browserVoice: val });
      }
  };

  const currentVoice = settings.ttsProvider === 'siliconflow' ? settings.sfTtsVoice : 
                       settings.ttsProvider === 'azure' ? settings.azureVoice : 
                       settings.ttsProvider === 'browser' ? settings.browserVoice : '';

  const getPlayButtonLabel = () => {
      const speed = settings.ttsProvider === 'google' ? '1.0' : settings.ttsSpeed;
      if (isAudioLoading) return "缓冲中...";
      
      const el = textareaRef.current;
      const start = el ? el.selectionStart : 0;
      const end = el ? el.selectionEnd : 0;
      const len = el ? el.value.length : 0;
      // Re-evaluate mode for label to be safe
      const effectiveMode = (start !== end) ? 'select' : (start > 0 && start < len && text.substring(start).trim().length > 0) ? 'continue' : 'all';

      if (effectiveMode === 'select') return `播放选中 (${Math.abs(end - start)}字)`;
      if (effectiveMode === 'continue') return `从光标处播放 (${speed}x)`;
      return `开始跟读 (${speed}x)`;
  };

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

        <div className="flex items-center gap-2 w-full md:w-auto relative">
            {isPlaying && !isAudioLoading ? (
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
                    disabled={!text || isAudioLoading}
                    className={`w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-full shadow-lg text-sm font-medium transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                        playMode === 'select' 
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 dark:shadow-none'
                        : 'bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-black shadow-gray-200 dark:shadow-none'
                    }`}
                >
                    {isAudioLoading ? (
                        <svg className="animate-spin h-4 w-4 text-white dark:text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        playMode === 'select' ? (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                        ) : (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        )
                    )}
                    {getPlayButtonLabel()}
                </button>
            )}
            
            {/* Loop Hint for Select Mode */}
            {playMode === 'select' && !isPlaying && !isAudioLoading && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900/90 dark:bg-white/90 text-white dark:text-gray-900 text-[10px] font-semibold px-3 py-1.5 rounded-full whitespace-nowrap animate-bounce shadow-xl border border-white/10 dark:border-black/5 z-50">
                   ✨ 保持选中可循环练习
                   <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900/90 dark:bg-white/90 rotate-45"></div>
                </div>
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
                onSelect={updatePlayMode}     // Update play mode on selection
                onKeyUp={updatePlayMode}      // Update on cursor movement
                onClick={updatePlayMode}      // Update on click
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
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                            当前音色 ({settings.ttsProvider === 'azure' ? 'Azure' : settings.ttsProvider === 'siliconflow' ? 'CosyVoice' : settings.ttsProvider === 'google' ? 'Google' : '本地'})
                        </label>
                        {settings.ttsProvider === 'browser' && (
                            <button 
                                onClick={() => setShowVoiceGuide(true)}
                                className="text-blue-500 dark:text-blue-400 hover:text-blue-600 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
                            </button>
                        )}
                    </div>
                    
                    {settings.ttsProvider === 'google' ? (
                         <div className="text-sm text-gray-500 dark:text-gray-400">Google 默认音色 (免费)</div>
                    ) : (
                        <select 
                            value={currentVoice}
                            onChange={(e) => handleVoiceChange(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 border-transparent rounded-xl text-sm font-medium text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-gray-700 transition-all appearance-none"
                        >
                            {/* Browser Provider Dropdown */}
                            {settings.ttsProvider === 'browser' && (
                                <>
                                    {uiVoices.map((v) => (
                                        <option 
                                            key={v.value} 
                                            value={v.value} 
                                            disabled={v.missing} // Keep disabled but style logic handles visual
                                            className={v.missing ? "text-gray-400" : ""}
                                        >
                                            {v.label}
                                        </option>
                                    ))}
                                </>
                            )}

                            {/* SiliconFlow Provider Dropdown */}
                            {settings.ttsProvider === 'siliconflow' && (
                                <>
                                    {!COSY_VOICES.some(v => v.value === currentVoice) && (
                                        <option value="">请选择音色...</option>
                                    )}
                                    {COSY_VOICES.map((v) => (
                                        <option key={v.value} value={v.value}>{v.label}</option>
                                    ))}
                                </>
                            )}

                            {/* Azure Provider Dropdown */}
                            {settings.ttsProvider === 'azure' && (
                                availableVoices.map((v) => (
                                    <option key={v.value} value={v.value}>{v.label}</option>
                                ))
                            )}
                        </select>
                    )}
                </div>

                {audioUrl && settings.ttsProvider !== 'google' && settings.ttsProvider !== 'browser' && (
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
                    <span>语速: {settings.ttsProvider === 'google' ? '1.0' : settings.ttsSpeed}x</span>
                    <span>快速</span>
                 </div>
                 
                 {settings.ttsProvider === 'google' ? (
                    <div className="w-full h-8 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-lg text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/5">
                        Google 免费接口不支持语速调节
                    </div>
                 ) : (
                     <input 
                        type="range" 
                        min="0.5" 
                        max="1.5" 
                        step="0.05" 
                        value={settings.ttsSpeed}
                        onChange={(e) => onSettingsChange({ ...settings, ttsSpeed: parseFloat(e.target.value) })}
                        className="w-full accent-black dark:accent-white h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer" 
                     />
                 )}
            </div>
        </div>
      </div>
      
      {/* High Quality Voice Guide Modal (Adapts to OS) */}
      {showVoiceGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-sm animate-in fade-in" onClick={() => setShowVoiceGuide(false)}>
              <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-[#1c1c1e] w-full max-w-md rounded-3xl p-6 shadow-2xl border border-white/20 dark:border-white/10">
                  <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">如何配置高音质?</h3>
                  
                  {isApple ? (
                      <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
                          <p>列表中灰显的音色（如 Daniel, Jamie）是苹果设备(iPhone/Mac)独有的高品质音色，需要您手动下载后才能使用。</p>
                          <ol className="list-decimal list-inside space-y-2 marker:font-bold marker:text-blue-500">
                              <li>打开 <strong>设置</strong> (Mac为系统设置)</li>
                              <li>进入 <strong>辅助功能</strong> -&gt; <strong>朗读内容</strong></li>
                              <li>点击 <strong>声音</strong> (或系统嗓音)</li>
                              <li>选择对应语言 (如 英语 -> 英语(英国))</li>
                              <li>下载 <strong>Enhanced/Premium (优化/高音质)</strong> 版本</li>
                          </ol>
                          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-green-700 dark:text-green-300 border border-green-100 dark:border-green-500/20 mt-4">
                              <strong>下载完成后：</strong> 刷新页面，灰显选项即会变亮，选中即可使用！
                          </div>
                      </div>
                  ) : isAndroid ? (
                       <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
                          <p>Android 设备推荐使用 <strong>Speech Services by Google</strong> 以获得最佳体验。</p>
                          <ol className="list-decimal list-inside space-y-2 marker:font-bold marker:text-green-500">
                              <li>打开 <strong>设置</strong> app</li>
                              <li>搜索并进入 <strong>文本转语音 (Text-to-speech)</strong></li>
                              <li>首选引擎选择 <strong>Speech Services by Google</strong></li>
                              <li>点击齿轮图标 -> 安装语音数据 -> 下载对应语言包</li>
                          </ol>
                          <div className="mt-4 text-xs text-gray-500">
                              提示: Android 音色列表中的 "Network" 或 "Online" 通常代表更高音质。
                          </div>
                      </div>
                  ) : (
                      <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
                          <p>请检查您的电脑系统设置 (Windows) 中的“语音”选项，下载并安装对应语言的高级语音包。</p>
                          <p>安装完成后重启浏览器即可识别。</p>
                      </div>
                  )}

                  <button onClick={() => setShowVoiceGuide(false)} className="w-full mt-6 py-3 bg-blue-600 text-white rounded-xl font-semibold">明白了</button>
              </div>
          </div>
      )}

      <WordDetailModal 
        data={lookupData} 
        isLoading={isLookingUp} 
        position={lookupPos} 
        onClose={() => setLookupPos(null)} 
      />
    </div>
  );
};
