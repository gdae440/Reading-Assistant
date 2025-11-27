
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
  const [addedAnalysisItems, setAddedAnalysisItems] = useState<Set<string>>(new Set());
  
  const [isReaderMode, setIsReaderMode] = useState(false);
  const [isBlindMode, setIsBlindMode] = useState(false);
  const [lookupData, setLookupData] = useState<LookupResult | null>(null);
  const [modalPosition, setModalPosition] = useState<{ x: number, y: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalysisCollapsed, setIsAnalysisCollapsed] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
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
    // Priority: Japanese -> Russian -> Chinese -> English
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
    
    // Check content after cursor for meaningful characters
    const textAfter = value.slice(selectionStart);
    const hasMeaningfulContent = /[a-zA-Z\u00C0-\u00FF\u0400-\u04FF\u4e00-\u9fa5\u3040-\u30ff\u3400-\u4dbf]/.test(textAfter);

    if (selectionEnd > selectionStart) {
        setPlayMode('select');
        setSelRange({ start: selectionStart, end: selectionEnd });
    } else if (selectionStart > 0 && selectionStart < value.length && hasMeaningfulContent) {
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
    setOcrStatus("识别中...");
    try {
        const base64 = await compressImage(file);
        const rawText = await sfService.ocrImage(base64, settings.visionModel);
        
        setOcrStatus("正在优化排版...");
        const cleanText = await sfService.fixOCRFormatting(rawText, settings.llmModel);

        setInputText(prev => prev + (prev ? "\n\n" : "") + cleanText);
    } catch (err) {
        alert("OCR 识别失败，请检查图片或网络");
        console.error(err);
    } finally {
        setOcrLoading(false);
        setOcrStatus("");
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
            
            // Re-fetch voices to ensure we have the latest list (fix for iOS Safari)
            const freshVoices = window.speechSynthesis.getVoices();
            
            let targetLang = detectedLang === 'zh' ? 'zh-CN' : detectedLang === 'ja' ? 'ja-JP' : detectedLang === 'ru' ? 'ru-RU' : 'en-US';
    
            if (settings.browserVoice) {
                const cleanName = settings.browserVoice.replace('missing:', '');
                
                // Advanced Voice Finding Logic for iOS
                // 1. Try exact match by URI
                // 2. Try matching by name
                // 3. IMPORTANT: Sort matches to prefer "Enhanced", "Premium" or "Siri" to fix iPhone quality issue
                let candidate: SpeechSynthesisVoice | undefined = freshVoices.find(v => v.voiceURI === settings.browserVoice);
                
                if (!candidate) {
                    const matchingVoices = freshVoices.filter(v => v.name.includes(cleanName));
                    if (matchingVoices.length > 0) {
                        // Sort so that "Enhanced" or "Premium" comes first. Also prefer longer names (usually more descriptive in iOS)
                        matchingVoices.sort((a, b) => {
                            const score = (name: string) => {
                                let s = 0;
                                if (name.includes('Enhanced')) s += 5;
                                if (name.includes('Premium')) s += 5;
                                if (name.includes('Siri')) s += 2;
                                return s;
                            };
                            return score(b.name) - score(a.name) || b.name.length - a.name.length;
                        });
                        candidate = matchingVoices[0];
                    }
                }

                if (candidate) {
                    uttr.voice = candidate;
                    uttr.lang = candidate.lang;
                } else {
                    // Fallback to searching ideal list to get correct lang code
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
             // Force speed 1.0 for Google Free TTS to prevent issues
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
        
        // Safeguard: Check if segment contains meaningful characters
        if (segment && /[a-zA-Z\u00C0-\u00FF\u0400-\u04FF\u4e00-\u9fa5\u3040-\u30ff\u3400-\u4dbf]/.test(segment)) {
            textToPlay = segment;
        } else {
            // Fallback to all if segment is just punctuation or empty
            setPlayMode('all'); 
            textToPlay = inputText; 
        }
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
    setAddedAnalysisItems(new Set()); // Reset added state
    setIsAnalysisCollapsed(false);

    try {
        const result = await sfService.analyzeText(inputText, settings.llmModel);
        setAnalysisResult(result);
    } catch (err) {
        alert("分析失败");
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleExportAnalysis = () => {
      if (!analysisResult) return;
      
      let csvContent = "";
      
      const addToCsv = (front: string, back: string, tag: string) => {
          const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
          csvContent += `${escape(front)},${escape(back)},${escape(tag)}\n`;
      };

      analysisResult.collocations.forEach(c => addToCsv(c.text, c.cn, "PolyGlot_Collocation"));
      analysisResult.vocabulary.forEach(v => addToCsv(v.text, v.cn, "PolyGlot_Vocab"));
      analysisResult.sentences.forEach(s => addToCsv(s.text, `${s.cn}\n\n[Reason: ${s.reason}]`, "PolyGlot_Sentence"));

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `analysis_export_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const addAnalysisItemToVocab = (item: {text: string, cn: string}) => {
      onAddToVocab({
          id: Date.now().toString(),
          word: item.text,
          meaningCn: item.cn,
          meaningRu: '',
          timestamp: Date.now()
      });
      // Update visual state instead of alert
      setAddedAnalysisItems(prev => new Set(prev).add(item.text));
  };

  const renderReaderContent = () => {
    if (!inputText) return <div className="text-gray-400 mt-10 text-center">在此粘贴文章，开始跟读...</div>;
    
    const normalizedInput = inputText.replace(/\r\n/g, '\n');
    const sentences = analysisResult?.sentences || [];

    return normalizedInput.split(/\n+/).map((para, pIdx) => {
        return (
            <p key={pIdx} className="mb-4 leading-relaxed text-lg text-gray-800 dark:text-gray-200">
                {para.split(/(\s+|[.,!?;:()（）"。！？])/).map((chunk, cIdx) => {
                    if (!chunk.trim() || /^[.,!?;:()（）"。！？]+$/.test(chunk)) return <span key={cIdx}>{chunk}</span>;
                    
                    const belongsToKeySentence = sentences.some(s => s.text.includes(chunk) && para.includes(s.text));
                    
                    return (
                        <span 
                            key={cIdx} 
                            onClick={(e) => handleWordClick(e, chunk)}
                            className={`cursor-pointer rounded px-0.5 transition-colors ${
                                belongsToKeySentence 
                                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-gray-900 dark:text-gray-100 border-b-2 border-yellow-300' 
                                : 'hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-700 dark:hover:text-blue-300'
                            }`}
                        >
                            {chunk}
                        </span>
                    );
                })}
            </p>
        );
    });
  };

  const handleVoiceChange = (val: string) => {
    // Allow selection even if missing, to trigger guide on next interaction or persist user wish
    if (settings.ttsProvider === 'siliconflow') onSettingsChange({ ...settings, sfTtsVoice: val });
    else if (settings.ttsProvider === 'azure') onSettingsChange({ ...settings, azureVoice: val });
    else onSettingsChange({ ...settings, browserVoice: val });
    
    // Show guide immediately if selecting a missing voice
    if (val.startsWith('missing:')) {
        if (isAndroid) setShowAndroidGuide(true);
        else setShowIosGuide(true);
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] max-w-5xl mx-auto relative" onClick={() => setModalPosition(null)}>
        {/* Top Toolbar */}
        <div className="flex-none p-4 md:p-6 pb-2">
            <div className="flex items-center justify-between bg-white dark:bg-[#1c1c1e] p-2 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 overflow-x-auto scrollbar-hide">
                 {/* Left Group */}
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
                        title="AI 智能分析"
                    >
                         {isAnalyzing ? <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                         : 
                         <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2C12 7 17 12 22 12C17 12 12 17 12 22C12 17 7 12 2 12C7 12 12 7 12 2Z" fill="url(#gemini-gradient)" />
                            <defs>
                                <linearGradient id="gemini-gradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                                    <stop offset="0%" stopColor="#3B82F6" />
                                    <stop offset="50%" stopColor="#8B5CF6" />
                                    <stop offset="100%" stopColor="#EC4899" />
                                </linearGradient>
                            </defs>
                         </svg>
                         }
                         <span className="text-xs font-bold hidden md:inline bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500">AI 分析</span>
                    </button>

                    {/* OCR Button Moved Here */}
                    <div className="relative">
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                            title="图片识别 (OCR)"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        </button>
                        {ocrLoading && <span className="absolute -top-1 -right-1 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span></span>}
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="image/*"
                            onChange={handleFileUpload}
                        />
                    </div>
                    {ocrLoading && <span className="text-xs text-blue-500 animate-pulse hidden md:inline ml-1">{ocrStatus}</span>}
                 </div>

                 {/* Right Group: Translation Moved Here */}
                 <div className="flex items-center gap-3">
                     <button
                        onClick={handleTranslateOrReply}
                        disabled={isTranslating}
                        className={`px-3 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap flex items-center gap-1 ${
                            detectedLang === 'zh'
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/40'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                     >
                         {isTranslating ? (
                             <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                         ) : (
                             detectedLang === 'zh' ? '✨ 俄语回复' : '全文翻译'
                         )}
                     </button>
                 </div>
            </div>
        </div>

        {/* Main Text Area - INCREASED PADDING & SPACER */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-96">
            <div className={`bg-white dark:bg-[#1c1c1e] rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 p-6 md:p-8 min-h-[60vh] relative transition-all duration-500 ${isBlindMode ? 'blur-md opacity-60 select-none' : ''}`}>
                {isReaderMode ? (
                    <div className="prose dark:prose-invert max-w-none">
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
                        className="w-full h-full min-h-[50vh] bg-transparent border-0 resize-none focus:ring-0 text-lg leading-relaxed text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 selection:bg-blue-200 dark:selection:bg-blue-800"
                        placeholder="在此粘贴文章，或点击相机上传图片..."
                    />
                )}
            </div>
            
            {/* Analysis Result Panel */}
            {analysisResult && (
                <div className="mt-8 mb-8 animate-in slide-in-from-bottom-5 duration-500">
                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-3xl border border-indigo-100 dark:border-indigo-500/20 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 flex items-center justify-between border-b border-indigo-100/50 dark:border-indigo-500/10 cursor-pointer" onClick={() => setIsAnalysisCollapsed(!isAnalysisCollapsed)}>
                             <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C12 7 17 12 22 12C17 12 12 17 12 22C12 17 7 12 2 12C7 12 12 7 12 2Z" fill="currentColor" /></svg>
                                <h3 className="font-bold text-gray-900 dark:text-white">AI 智能分析</h3>
                             </div>
                             <div className="flex items-center gap-3">
                                 <button 
                                    onClick={(e) => { e.stopPropagation(); handleExportAnalysis(); }}
                                    className="text-xs px-3 py-1 bg-white dark:bg-gray-800 border border-indigo-100 dark:border-indigo-500/20 rounded-full text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 flex items-center gap-1"
                                 >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                    一键打包
                                 </button>
                                 <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-transform duration-300" style={{ transform: isAnalysisCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                 </button>
                             </div>
                        </div>

                        {!isAnalysisCollapsed && (
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Collocations */}
                                <div>
                                    <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">常用词块 (Collocations)</h4>
                                    <div className="space-y-3">
                                        {analysisResult.collocations.map((item, idx) => (
                                            <div key={idx} className="flex items-start justify-between group bg-white/50 dark:bg-white/5 p-3 rounded-xl hover:bg-white dark:hover:bg-white/10 transition-colors">
                                                <div>
                                                    <div className="font-semibold text-gray-800 dark:text-gray-200">{item.text}</div>
                                                    <div className="text-sm text-gray-500 dark:text-gray-400">{item.cn}</div>
                                                </div>
                                                <button 
                                                    onClick={() => addAnalysisItemToVocab(item)}
                                                    disabled={addedAnalysisItems.has(item.text)}
                                                    className={`p-1.5 rounded-lg transition-colors ${
                                                        addedAnalysisItems.has(item.text) 
                                                        ? 'text-green-500' 
                                                        : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
                                                    }`}
                                                >
                                                    {addedAnalysisItems.has(item.text) ? (
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                                    ) : (
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                                                    )}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Vocabulary */}
                                <div>
                                    <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">核心词汇 (Vocabulary)</h4>
                                    <div className="space-y-3">
                                        {analysisResult.vocabulary.map((item, idx) => (
                                            <div key={idx} className="flex items-start justify-between group bg-white/50 dark:bg-white/5 p-3 rounded-xl hover:bg-white dark:hover:bg-white/10 transition-colors">
                                                <div>
                                                    <div className="font-bold text-gray-900 dark:text-white">{item.text}</div>
                                                    <div className="text-sm text-gray-500 dark:text-gray-400">{item.cn}</div>
                                                </div>
                                                <button 
                                                    onClick={() => addAnalysisItemToVocab(item)}
                                                    disabled={addedAnalysisItems.has(item.text)}
                                                    className={`p-1.5 rounded-lg transition-colors ${
                                                        addedAnalysisItems.has(item.text) 
                                                        ? 'text-green-500' 
                                                        : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
                                                    }`}
                                                >
                                                     {addedAnalysisItems.has(item.text) ? (
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                                    ) : (
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                                                    )}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Key Sentences Section (Always visible if expanded) */}
                        {!isAnalysisCollapsed && analysisResult.sentences && analysisResult.sentences.length > 0 && (
                            <div className="px-6 pb-6 pt-0 border-t border-indigo-100/50 dark:border-indigo-500/10">
                                 <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider my-4 flex items-center gap-2">
                                     🎙️ 重点跟读 (Key Sentences)
                                 </h4>
                                 <div className="space-y-4">
                                     {analysisResult.sentences.map((sent, idx) => (
                                         <div key={idx} className="bg-white/80 dark:bg-white/5 p-4 rounded-xl border border-indigo-50 dark:border-white/5">
                                             <div className="flex gap-3">
                                                 <button 
                                                    onClick={() => playOneSegment(sent.text)}
                                                    className="mt-1 flex-none w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
                                                 >
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                                 </button>
                                                 <div>
                                                     <p className="font-medium text-gray-900 dark:text-white text-lg leading-relaxed">{sent.text}</p>
                                                     <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{sent.cn}</p>
                                                     <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-2 italic flex items-center gap-1">
                                                         <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                         {sent.reason}
                                                     </p>
                                                 </div>
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {/* Translation Result Panel */}
            {translationResult && (
                <div className="mt-6 mb-8 animate-in slide-in-from-bottom-5 duration-500">
                     <div className={`rounded-3xl p-6 shadow-sm border ${
                         translationResult.type === 'reply' 
                         ? 'bg-purple-50 dark:bg-purple-900/10 border-purple-100 dark:border-purple-500/20' 
                         : 'bg-white dark:bg-[#1c1c1e] border-gray-100 dark:border-white/10'
                     }`}>
                         <div className="flex justify-between items-start mb-3">
                             <div className="flex items-center gap-2">
                                 <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                     translationResult.type === 'reply' 
                                     ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                                     : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                 }`}>
                                     {translationResult.type === 'reply' ? 'AI 回复建议' : '全文翻译'}
                                 </span>
                             </div>
                             <div className="flex gap-2">
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(translationResult.text);
                                        alert("已复制");
                                    }}
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                                    title="复制"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                </button>
                                <button 
                                    onClick={() => setTranslationResult(null)}
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                             </div>
                         </div>
                         <div className="text-lg leading-relaxed whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                             {translationResult.text}
                         </div>
                     </div>
                </div>
            )}
            
            {/* SPACER FOR SCROLLING PAST FLOATING PLAYER */}
            <div className="h-40 md:h-44 w-full" aria-hidden="true" />
        </div>

        {/* Bottom Floating Control Bar */}
        <div className="fixed bottom-6 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-full md:max-w-3xl p-4 bg-white/90 dark:bg-[#1c1c1e]/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-white/10 z-40 transition-all duration-300 pb-4">
             <div className="flex flex-col gap-4">
                 <div className="flex items-center gap-3">
                     {/* Play Button */}
                     <button
                        onClick={handleTTS}
                        disabled={ttsStatus === 'loading' || isFetchingAudio.current}
                        className={`flex-none w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-500/30 transition-all ${
                            ttsStatus === 'playing' ? 'bg-red-500 hover:bg-red-600' : 'bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200'
                        }`}
                     >
                         {ttsStatus === 'loading' || isFetchingAudio.current ? (
                             <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                         ) : ttsStatus === 'playing' ? (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                         ) : (
                            <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
                         )}
                     </button>
                     
                     <div className="flex-1 min-w-0 flex flex-col justify-center">
                         <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-2">
                             {settings.shadowingMode && <span className="bg-green-100 text-green-700 px-1.5 rounded text-[10px]">跟读开启</span>}
                             {playMode === 'select' ? `播放选中 (${selRange.end - selRange.start}字)` : 
                              playMode === 'continue' ? '从光标处播放' : '全文跟读'}
                              {playMode === 'select' && (
                                  <span className="text-[10px] text-blue-500 animate-pulse">✨ 保持选中可循环练习</span>
                              )}
                         </div>
                         
                         {/* Voice Selector */}
                         {settings.ttsProvider === 'google' ? (
                             <div className="text-sm font-bold text-gray-800 dark:text-white">Google 默认音色</div>
                         ) : (
                             <div className="flex items-center gap-2 w-full">
                                <div className="relative flex-1">
                                    <select 
                                        value={
                                            settings.ttsProvider === 'siliconflow' ? settings.sfTtsVoice :
                                            settings.ttsProvider === 'azure' ? settings.azureVoice :
                                            settings.browserVoice
                                        }
                                        onChange={(e) => handleVoiceChange(e.target.value)}
                                        className="w-full bg-transparent font-bold text-gray-900 dark:text-white text-sm focus:outline-none appearance-none pr-8 cursor-pointer truncate"
                                    >
                                        {settings.ttsProvider === 'siliconflow' && SF_VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                                        {settings.ttsProvider === 'azure' && AZURE_VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                                        {settings.ttsProvider === 'browser' && (
                                            uiVoices.length > 0 
                                            ? uiVoices.map(v => <option key={v.value} value={v.value} disabled={v.disabled} className={v.disabled ? 'text-gray-400' : ''}>{v.label}</option>)
                                            : <option value="" disabled>加载本地音色...</option>
                                        )}
                                    </select>
                                    <svg className="w-4 h-4 text-gray-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                                
                                {(settings.ttsProvider === 'browser' || settings.ttsProvider === 'azure') && (
                                    <button 
                                        onClick={() => settings.ttsProvider === 'browser' ? setShowIosGuide(true) : alert("Azure 音色为云端合成，音质由微软保证。")}
                                        className="p-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 flex-none"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    </button>
                                )}
                             </div>
                         )}
                     </div>

                     {/* Action Buttons */}
                     {audioUrl && settings.ttsProvider !== 'google' && (
                         <a 
                            href={audioUrl} 
                            download={`speech_${Date.now()}.mp3`}
                            className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            title="下载音频"
                         >
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                         </a>
                     )}
                 </div>

                 {/* Row 2: Speed Slider */}
                 {settings.ttsProvider === 'google' ? (
                     <div className="w-full py-1 px-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-xs rounded-lg text-center border border-yellow-100 dark:border-yellow-500/20">
                         Google 免费接口不支持语速调节 (默认 1.0x)
                     </div>
                 ) : (
                     <div className="flex items-center gap-3 px-1">
                         <span className="text-xs font-bold text-gray-400 w-8">0.5x</span>
                         <input 
                             type="range" min="0.5" max="1.5" step="0.1"
                             value={settings.ttsSpeed}
                             onChange={(e) => onSettingsChange({ ...settings, ttsSpeed: parseFloat(e.target.value) })}
                             className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-black dark:accent-white"
                         />
                         <span className="text-xs font-bold text-gray-400 w-8 text-right">1.5x</span>
                         <span className="text-xs font-mono font-medium text-gray-900 dark:text-white min-w-[32px] text-center bg-gray-100 dark:bg-gray-800 rounded px-1">{settings.ttsSpeed.toFixed(1)}x</span>
                     </div>
                 )}
             </div>
        </div>
        
        {/* Modals */}
        <WordDetailModal 
            data={lookupData} 
            isLoading={isLoading} 
            position={modalPosition}
            onClose={() => setModalPosition(null)}
        />

        {showIosGuide && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowIosGuide(false)}>
                <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-[#1c1c1e] p-6 rounded-3xl max-w-sm w-full shadow-2xl relative border border-white/10">
                    <button onClick={() => setShowIosGuide(false)} className="absolute top-4 right-4 text-gray-400">
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                    <h4 className="font-bold text-lg mb-4 text-gray-900 dark:text-white">如何开启高音质 (iOS)?</h4>
                    <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
                        <p>iOS 系统自带非常优质的神经网络引擎音色（如 Daniel, TingTing 增强版），但需要手动下载。</p>
                        <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-2xl space-y-2">
                            <div className="font-bold text-gray-900 dark:text-white mb-2">设置步骤：</div>
                            <ol className="list-decimal list-inside space-y-1">
                                <li>打开 <strong>设置</strong> → <strong>辅助功能</strong></li>
                                <li>点击 <strong>朗读内容</strong> → <strong>声音</strong></li>
                                <li>选择对应语言 (如 英语 → 英语(英国))</li>
                                <li>下载 <strong>Enhanced/Premium (优化/高音质)</strong> 版本</li>
                            </ol>
                            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-green-700 dark:text-green-300 text-xs mt-3 border border-green-100 dark:border-green-500/20">
                                下载完成后，回到本应用刷新，即可在下拉菜单中选择该音色。
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {showAndroidGuide && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowAndroidGuide(false)}>
                <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-[#1c1c1e] p-6 rounded-3xl max-w-sm w-full shadow-2xl relative border border-white/10">
                    <button onClick={() => setShowAndroidGuide(false)} className="absolute top-4 right-4 text-gray-400">
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                    <h4 className="font-bold text-lg mb-4 text-gray-900 dark:text-white">Android 高音质指南</h4>
                    <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
                        <p>建议安装 Google 官方语音服务以获得最佳体验。</p>
                        <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-2xl space-y-2">
                            <ol className="list-decimal list-inside space-y-1">
                                <li>进入 <strong>系统设置</strong> → <strong>辅助功能</strong></li>
                                <li>点击 <strong>文本转语音 (TTS) 输出</strong></li>
                                <li>首选引擎选择 <strong>Speech Services by Google</strong></li>
                                <li>点击齿轮图标 → 安装语音数据 → 下载对应语言包</li>
                            </ol>
                            <div className="mt-4 text-xs text-gray-500">
                                提示: Android 音色列表中的 "Network" 或 "Online" 通常代表更高音质。
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};