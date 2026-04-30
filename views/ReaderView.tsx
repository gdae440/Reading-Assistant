
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AppSettings, WordEntry, HistoryEntry, LookupResult, AnalysisResult } from '../types';
import { SiliconFlowService } from '../services/siliconFlow';
import { AzureTTSService, AZURE_VOICES } from '../services/azureTTS';
import { EdgeCloudTTSService, EDGE_TTS_VOICES } from '../services/edgeTTSClient';
import { WordDetailModal } from '../components/WordDetailModal';
import { useLocalStorage } from '../hooks/useLocalStorage';

// SiliconFlow CosyVoice2 音色列表
const SF_VOICES = [
    { label: "Anna (沉稳女声)", value: "FunAudioLLM/CosyVoice2-0.5B:anna" },
    { label: "Bella (激情女声)", value: "FunAudioLLM/CosyVoice2-0.5B:bella" },
    { label: "Claire (温柔女声)", value: "FunAudioLLM/CosyVoice2-0.5B:claire" },
    { label: "Diana (欢快女声)", value: "FunAudioLLM/CosyVoice2-0.5B:diana" },
    { label: "Alex (沉稳男声)", value: "FunAudioLLM/CosyVoice2-0.5B:alex" },
    { label: "Benjamin (低沉男声)", value: "FunAudioLLM/CosyVoice2-0.5B:benjamin" },
    { label: "Charles (磁性男声)", value: "FunAudioLLM/CosyVoice2-0.5B:charles" },
    { label: "David (欢快男声)", value: "FunAudioLLM/CosyVoice2-0.5B:david" },
    { label: "Qian (女 - 中文)", value: "FunAudioLLM/CosyVoice2-0.5B:qian" },
    { label: "Meimei (女 - 中文)", value: "FunAudioLLM/CosyVoice2-0.5B:meimei" },
    { label: "Zhe (男 - 中文)", value: "FunAudioLLM/CosyVoice2-0.5B:zhe" },
    { label: "Adam (男 - 英文/多语)", value: "FunAudioLLM/CosyVoice2-0.5B:adam" },
];

// 语音获取 Hook - 增强版，支持延迟加载和手动刷新
const useBrowserVoices = () => {
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const update = () => {
            const allVoices = window.speechSynthesis.getVoices();
            setVoices(allVoices || []);
            if (allVoices.length > 0) setIsLoading(false);
        };

        // 立即尝试获取
        update();

        // 监听语音变化（iOS/Mac 需要）
        window.speechSynthesis.onvoiceschanged = update;

        // 多次重试，因为某些浏览器需要多次触发
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            const allVoices = window.speechSynthesis.getVoices();
            if (allVoices && allVoices.length > 0) {
                setVoices(allVoices);
                setIsLoading(false);
                clearInterval(interval);
            }
            if (attempts > 20) {
                setIsLoading(false);
                clearInterval(interval);
            }
        }, 500);

        return () => {
            window.speechSynthesis.onvoiceschanged = null;
            clearInterval(interval);
        };
    }, []);

    return { voices, isLoading };
};

const isNoveltyVoice = (voice: SpeechSynthesisVoice): boolean => {
    const name = voice.name.toLowerCase();
    return [
        'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged',
        'good news', 'hysterical', 'jester', 'organ', 'superstar', 'trinoids',
        'whisper', 'zarvox'
    ].some(blocked => name.includes(blocked));
};

const browserLangMatches = (voiceLang: string, detectedLang: string): boolean => {
    const lang = voiceLang.toLowerCase();
    if (!lang) return false;

    if (detectedLang === 'zh') {
        if (lang === 'zh-hk' || lang === 'yue-hk' || lang === 'zh-tw') return false;
        return lang.startsWith('zh-cn') || lang.startsWith('zh');
    }
    if (detectedLang === 'ja') return lang.startsWith('ja');
    if (detectedLang === 'ru') return lang.startsWith('ru');
    return lang === 'en-gb' || lang === 'en-us' || lang.startsWith('en-');
};

const isBrowserProvider = (provider: AppSettings['ttsProvider']) =>
    provider === 'browser';

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

const splitBrowserSpeechSegments = (text: string): string[] => {
    const result: string[] = [];
    const sentences = splitTextIntoSentences(text).map(s => s.trim()).filter(Boolean);

    for (const sentence of sentences) {
        if (sentence.length <= 180) {
            result.push(sentence);
            continue;
        }

        for (let i = 0; i < sentence.length; i += 160) {
            result.push(sentence.slice(i, i + 160));
        }
    }

    return result.length > 0 ? result : [text];
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
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalysisCollapsed, setIsAnalysisCollapsed] = useLocalStorage("reader_analysis_collapsed", false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  
  // Play Modes
  const [playMode, setPlayMode] = useState<'all' | 'select' | 'continue'>('all');
  const [selRange, setSelRange] = useState({ start: 0, end: 0 });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { voices: browserVoices, isLoading: voicesLoading } = useBrowserVoices();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Audio Cache (LRU - Max 10)
  const audioCache = useRef<Map<string, string>>(new Map());
  const isFetchingAudio = useRef(false);
  const isStoppedRef = useRef(false); // To break the shadowing loop
  const ttsStatusRef = useRef<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const playbackRevisionRef = useRef(0);
  const activeSpeechResolveRef = useRef<(() => void) | null>(null);
  const activeAudioResolveRef = useRef<(() => void) | null>(null);
  const isScrolling = useRef(false);
  const lastSelectionRef = useRef<string>("");

  const sfService = useMemo(() => new SiliconFlowService(settings.apiKey), [settings.apiKey]);
  const edgeService = useMemo(() => new EdgeCloudTTSService(), []);
  const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);

  useEffect(() => {
    ttsStatusRef.current = ttsStatus;
  }, [ttsStatus]);

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

  // UI Voices Logic - 只显示标准的语音，Mac 音效包（如 Bubbles、Cellos）不要
  const uiVoices = useMemo(() => {
    if (!isBrowserProvider(settings.ttsProvider)) return [];

    const matchingVoices = browserVoices.filter(v => {
        if (isNoveltyVoice(v)) return false;
        return browserLangMatches(v.lang || '', detectedLang);
    });

    const preferredVoices = matchingVoices.filter(v => v.localService);
    const langVoices = preferredVoices.length > 0 ? preferredVoices : matchingVoices;

    // 质量评分：Premium/Enhanced > 普通
    const qualityScore = (v: SpeechSynthesisVoice): number => {
        let score = 0;
        const name = v.name.toLowerCase();
        if (name.includes('premium')) score += 20;
        if (name.includes('enhanced')) score += 15;
        if (name.includes('neural')) score += 10;
        if (name.includes('siri')) score += 3;
        if (v.localService) score += 1;
        return score;
    };

    // 按质量排序
    const sortedVoices = [...langVoices].sort((a, b) => qualityScore(b) - qualityScore(a));

    // 映射到选项
    const result = sortedVoices.map(v => ({
        value: v.voiceURI,
        label: `${v.name}${v.localService ? '' : ' (在线)'}`
    }));

    return result;
  }, [browserVoices, detectedLang, settings.ttsProvider]);


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

        stopTTSIfActive();
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
    } catch (err) {
        setLookupData(null);
    } finally {
        setIsLoading(false);
    }
  };

  const handleWordClick = async (e: React.MouseEvent<HTMLSpanElement>, word: string) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const MODAL_WIDTH = 320;
    const MODAL_HEIGHT = 300;

    // 弹窗是 fixed 定位，使用视口坐标
    let x = rect.left;
    let y = rect.bottom + 10;

    // 检查右侧边界
    if (x + MODAL_WIDTH > window.innerWidth) {
      x = window.innerWidth - MODAL_WIDTH - 16;
    }

    // 检查底部边界：如果底部空间不够，将弹窗显示在单词上方
    if (y + MODAL_HEIGHT > window.innerHeight) {
      y = rect.top - MODAL_HEIGHT - 10;
    }

    // 确保 x 和 y 不为负数
    if (x < 10) x = 10;
    if (y < 10) y = rect.bottom + 10;

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

  const beginTTSRun = () => {
    const nextRevision = playbackRevisionRef.current + 1;
    playbackRevisionRef.current = nextRevision;
    isStoppedRef.current = false;
    return nextRevision;
  };

  const isTTSRunCurrent = (revision: number) => {
    return playbackRevisionRef.current === revision && !isStoppedRef.current;
  };

  const stopTTS = () => {
    playbackRevisionRef.current += 1;
    isStoppedRef.current = true;

    activeSpeechResolveRef.current?.();
    activeSpeechResolveRef.current = null;

    activeAudioResolveRef.current?.();
    activeAudioResolveRef.current = null;

    if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
    }
    // 停止 Browser TTS
    window.speechSynthesis.cancel();
    setTtsStatus('idle');
    isFetchingAudio.current = false;
  };

  const stopTTSIfActive = () => {
    if (ttsStatusRef.current !== 'idle' || isFetchingAudio.current) {
        stopTTS();
    }
  };

  const pauseTTS = () => {
    if (isBrowserProvider(settings.ttsProvider)) {
        window.speechSynthesis.pause();
        setTtsStatus('paused');
        return;
    }

    if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setTtsStatus('paused');
    }
  };

  const resumeTTS = () => {
    if (isBrowserProvider(settings.ttsProvider)) {
        window.speechSynthesis.resume();
        setTtsStatus('playing');
        return;
    }

    if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch(console.error);
        setTtsStatus('playing');
    }
  };

  const ttsConfigSignature = useMemo(() => JSON.stringify({
    provider: settings.ttsProvider,
    speed: settings.ttsSpeed,
    sfModel: settings.sfTtsModel,
    sfVoice: settings.sfTtsVoice,
    azureRegion: settings.azureRegion,
    azureVoice: settings.azureVoice,
    browserVoice: settings.browserVoice,
    edgeVoice: settings.edgeVoice,
    shadowingMode: settings.shadowingMode,
    shadowingPause: settings.shadowingPause
  }), [
    settings.ttsProvider,
    settings.ttsSpeed,
    settings.sfTtsModel,
    settings.sfTtsVoice,
    settings.azureRegion,
    settings.azureVoice,
    settings.browserVoice,
    settings.edgeVoice,
    settings.shadowingMode,
    settings.shadowingPause
  ]);

  const previousTTSConfigRef = useRef(ttsConfigSignature);
  useEffect(() => {
    if (previousTTSConfigRef.current !== ttsConfigSignature) {
        stopTTSIfActive();
        previousTTSConfigRef.current = ttsConfigSignature;
    }
  }, [ttsConfigSignature]);

  const previousInputTextRef = useRef(inputText);
  useEffect(() => {
    if (previousInputTextRef.current !== inputText) {
        stopTTSIfActive();
        previousInputTextRef.current = inputText;
    }
  }, [inputText]);

  const playOneSegment = async (text: string, playbackRevision: number): Promise<void> => {
     if (!text.trim()) return;
     if (!isTTSRunCurrent(playbackRevision)) return;

     if (isBrowserProvider(settings.ttsProvider)) {
        return new Promise((resolve, reject) => {
            const finish = () => {
                if (activeSpeechResolveRef.current === finish) {
                    activeSpeechResolveRef.current = null;
                }
                resolve();
            };
            activeSpeechResolveRef.current = finish;

            const uttr = new SpeechSynthesisUtterance(text);
            uttr.rate = settings.ttsSpeed;

            // 获取所有可用语音
            const freshVoices = window.speechSynthesis.getVoices() || [];

            // 语言代码映射
            const langMap: Record<string, string> = {
                'zh': 'zh-CN',
                'ja': 'ja-JP',
                'ru': 'ru-RU',
                'en': 'en-US'
            };
            const targetLang = langMap[detectedLang] || 'en-US';

            // 获取用户选择的语音
            const selectedVoiceURI = settings.browserVoice;

            if (selectedVoiceURI) {
                // 去掉 "missing:" 前缀
                const cleanName = selectedVoiceURI.replace('missing:', '');

                // 查找策略：1. URI 完全匹配 2. 名称包含匹配 3. 优先高质量版本
                let candidate: SpeechSynthesisVoice | undefined;

                // 策略1: URI 完全匹配
                candidate = freshVoices.find(v => v.voiceURI === selectedVoiceURI);

                // 策略2: 名称匹配 (考虑各种可能的名称格式)
                if (!candidate) {
                    const namePatterns = [
                        cleanName,                                    // 原始名称
                        cleanName.replace(/\s+(Enhanced|Premium)$/, ''), // 无后缀
                        cleanName.replace(/\s+\d+$/, ''),             // 无数字后缀
                    ];

                    for (const pattern of namePatterns) {
                        const match = freshVoices.find(v =>
                            v.name === pattern ||
                            v.name.includes(pattern) ||
                            pattern.includes(v.name)
                        );
                        if (match) {
                            candidate = match;
                            break;
                        }
                    }
                }

                // 策略3: 同一语言的 Premium/Enhanced 优先
                if (!candidate && freshVoices.length > 0) {
                    const matchingVoices = freshVoices.filter(v => browserLangMatches(v.lang || '', detectedLang) && !isNoveltyVoice(v));
                    const preferredVoices = matchingVoices.filter(v => v.localService);
                    const langVoices = preferredVoices.length > 0 ? preferredVoices : matchingVoices;

                    // 优先找 Premium/Enhanced/Siri
                    const qualityVoice = langVoices.find(v =>
                        v.name.includes('Premium') ||
                        v.name.includes('Enhanced') ||
                        v.name.includes('Siri') ||
                        v.name.includes('Neural')
                    );

                    if (qualityVoice) {
                        candidate = qualityVoice;
                    }
                }

                if (candidate) {
                    uttr.voice = candidate;
                    // 使用语音的原始 lang 设置，避免覆盖
                    uttr.lang = candidate.lang || targetLang;

                    console.log(`[TTS] 使用语音: ${candidate.name} (${candidate.lang})`);
                } else {
                    // 找不到对应语音，使用语言默认
                    uttr.lang = targetLang;
                    console.log(`[TTS] 未找到 ${cleanName}，使用默认 ${targetLang}`);
                }
            } else {
                // 未选择语音，使用检测到的语言
                uttr.lang = targetLang;
            }

            // 确保 lang 格式正确
            if (!uttr.lang || uttr.lang === 'undefined') {
                uttr.lang = targetLang;
            }

            setTtsStatus('playing');
            uttr.onend = finish;
            uttr.onerror = (e) => {
                activeSpeechResolveRef.current = null;
                console.error('[TTS] 播放错误:', e);
                reject(e);
            };

            if (isTTSRunCurrent(playbackRevision)) {
                window.speechSynthesis.speak(uttr);
            } else {
                finish();
            }
        });
     }
     
     // API TTS
     const cacheKey = JSON.stringify({
        text,
        provider: settings.ttsProvider,
        sfModel: settings.sfTtsModel,
        sfVoice: settings.sfTtsVoice,
        azureRegion: settings.azureRegion,
        azureVoice: settings.azureVoice,
        edgeVoice: settings.edgeVoice,
        speed: settings.ttsSpeed
     });
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
                } else if (settings.ttsProvider === 'edge') {
                    return await edgeService.generateSpeech(text, settings.edgeVoice, settings.ttsSpeed);
                } else {
                    if (!settings.azureKey) throw new Error("缺少 Key");
                    const azure = new AzureTTSService(settings.azureKey, settings.azureRegion);
                    return await azure.generateSpeech(text, settings.azureVoice, settings.ttsSpeed);
                }
            })();
            
            // CosyVoice2 首次生成较慢，设置 60 秒超时
            const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("请求超时 (CosyVoice2 生成较慢，请稍候)")), 60000));
            audioData = await Promise.race([fetchPromise, timeoutPromise]);

            if (!isTTSRunCurrent(playbackRevision)) return;
            
            const blob = new Blob([audioData], { type: 'audio/mp3' });
            url = URL.createObjectURL(blob);
            saveAudioToCache(cacheKey, url);
        } catch(err: any) {
             if (err.message === "Azure_429") alert("请求过于频繁 (Azure 限制)，请稍后再试");
             else alert(err.message || "TTS Error");
             throw err;
        } finally {
            if (playbackRevisionRef.current === playbackRevision) {
                isFetchingAudio.current = false;
            }
        }
     }
     
     if (url) {
         if (!isTTSRunCurrent(playbackRevision)) return;
         setAudioUrl(url);
         return new Promise((resolve, reject) => {
             const audio = new Audio(url);
             audioRef.current = audio;
             const finish = () => {
                 if (activeAudioResolveRef.current === finish) {
                     activeAudioResolveRef.current = null;
                 }
                 resolve();
             };
             activeAudioResolveRef.current = finish;

             // 设置 ttsStatus 为 playing，这样播放按钮会变成暂停按钮
             setTtsStatus('playing');

             audio.onended = () => {
                 finish();
             };
             audio.onerror = (e) => {
                 activeAudioResolveRef.current = null;
                 reject(e);
             };
             audio.play().catch((err) => {
                 setTtsStatus('idle');
                 reject(err);
             });
         });
     }
  };

  const handleTTS = async () => {
    if (!inputText.trim()) return;

    // 处理暂停/继续逻辑
    if (ttsStatus === 'paused') {
        resumeTTS();
        return;
    }

    // 如果正在播放，点击则暂停
    if (ttsStatus === 'playing') {
        pauseTTS();
        return;
    }

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
    const playbackRevision = beginTTSRun();
    setTtsStatus(settings.shadowingMode ? 'playing' : 'loading');

    // REFACTORED SHADOWING MODE LOOP
    if (settings.shadowingMode) {
        setTtsStatus('playing');
        const sentences = splitTextIntoSentences(textToPlay);
        
        for (const sentence of sentences) {
            if (!isTTSRunCurrent(playbackRevision)) break;
            if (!sentence.trim()) continue;

            try {
                // 1. Play Sentence
                await playOneSegment(sentence, playbackRevision);
                
                if (!isTTSRunCurrent(playbackRevision)) break;

                // 2. Pause for Shadowing
                await new Promise(resolve => {
                    setTimeout(resolve, settings.shadowingPause * 1000);
                });

            } catch (err) {
                console.error("Playback error", err);
                break;
            }
        }
        if (isTTSRunCurrent(playbackRevision)) setTtsStatus('idle');
    } 
    else {
        try {
            if (isBrowserProvider(settings.ttsProvider)) {
                const segments = splitBrowserSpeechSegments(textToPlay);
                for (const segment of segments) {
                    if (!isTTSRunCurrent(playbackRevision)) break;
                    await playOneSegment(segment, playbackRevision);
                }
            } else {
                await playOneSegment(textToPlay, playbackRevision);
            }
        } catch (e) {
             // Handled internally
        }
        if (isTTSRunCurrent(playbackRevision)) setTtsStatus('idle');
    }
  };

  // 全文翻译
  const handleTranslate = async () => {
    if (!inputText.trim()) { alert("请先输入内容"); return; }
    if (!settings.apiKey) { alert("请配置 API Key"); return; }

    setIsTranslating(true);
    setTranslationResult(null);

    try {
        const result = await sfService.translateArticle(inputText, settings.llmModel);
        onAddToHistory({
            id: Date.now().toString(),
            original: inputText,
            translation: result,
            type: 'translation',
            timestamp: Date.now()
        });
        setTranslationResult({ text: result, type: 'translation' });
    } catch (err) {
        alert("请求失败，请检查网络或 API Key");
    } finally {
        setIsTranslating(false);
    }
  };

  // 俄语回复
  const handleRussianReply = async () => {
    if (!inputText.trim()) { alert("请先输入内容"); return; }
    if (!settings.apiKey) { alert("请配置 API Key"); return; }

    setIsTranslating(true);
    setTranslationResult(null);

    try {
        const result = await sfService.generateContextAwareReply(inputText, settings.llmModel);
        onAddToHistory({
            id: Date.now().toString(),
            original: inputText,
            translation: result,
            type: 'reply',
            timestamp: Date.now()
        });
        setTranslationResult({ text: result, type: 'reply' });
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
      
      const preventCsvFormula = (value: string) => {
          const trimmedStart = value.trimStart();
          if (/^[=+\-@]/.test(trimmedStart)) return `'${value}`;
          return value;
      };

      const addToCsv = (front: string, back: string, tag: string) => {
          const escape = (s: string) => `"${preventCsvFormula(s).replace(/"/g, '""')}"`;
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
      URL.revokeObjectURL(url);
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

  const handleInputTextChange = (value: string) => {
      stopTTSIfActive();
      setInputText(value);
  };

  const handlePlaySingleSentence = async (text: string) => {
      if (!text.trim()) return;
      stopTTS();
      const playbackRevision = beginTTSRun();
      setTtsStatus('loading');
      try {
          await playOneSegment(text, playbackRevision);
      } catch {
          // playOneSegment already surfaces provider errors.
      } finally {
          if (isTTSRunCurrent(playbackRevision)) setTtsStatus('idle');
      }
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
    stopTTSIfActive();
    // Allow selection even if missing, to trigger guide on next interaction or persist user wish
    if (settings.ttsProvider === 'siliconflow') onSettingsChange({ ...settings, sfTtsVoice: val });
    else if (settings.ttsProvider === 'azure') onSettingsChange({ ...settings, azureVoice: val });
    else if (settings.ttsProvider === 'edge') onSettingsChange({ ...settings, edgeVoice: val });
    else onSettingsChange({ ...settings, browserVoice: val });
    
    // Show guide immediately if selecting a missing voice
    if (val.startsWith('missing:')) {
        if (isAndroid) setShowAndroidGuide(true);
        else setShowIosGuide(true);
    }
  };

  const playButtonLabel =
    ttsStatus === 'loading' ? '正在准备朗读' :
    ttsStatus === 'playing' ? '暂停朗读' :
    ttsStatus === 'paused' ? '继续朗读' :
    '开始朗读';

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] max-w-5xl mx-auto relative" onClick={() => setModalPosition(null)}>
        {/* Top Toolbar */}
        <div className="flex-none p-3 md:p-6 pb-2">
            <div className="flex items-center justify-between bg-white dark:bg-[#1c1c1e] p-2 md:p-2 rounded-xl shadow-sm border border-gray-100 dark:border-white/10 overflow-x-auto scrollbar-hide">
                 {/* Left Group */}
                 <div className="flex items-center gap-1.5 md:gap-2">
                    <button
                        onClick={() => setIsReaderMode(!isReaderMode)}
                        className={`px-3.5 py-2 md:px-4 md:py-2 rounded-lg text-sm md:text-sm font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${isReaderMode ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
                    >
                        {isReaderMode ? '编辑' : '查词'}
                    </button>

                    <button
                        onClick={() => setIsBlindMode(!isBlindMode)}
                        className={`p-2 md:p-2 rounded-lg flex-none transition-colors flex items-center gap-1.5 ${
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
                        className={`p-2 md:p-2 rounded-lg flex-none transition-colors flex items-center gap-1.5 ${
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
                         <span className="text-xs font-bold hidden md:inline bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500">AI</span>
                    </button>

                    {/* OCR Button Moved Here */}
                    <div className="relative">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors rounded-lg"
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

                 {/* Right Group: Translation Buttons */}
                 <div className="flex items-center gap-1.5 md:gap-2">
                     <button
                        onClick={handleTranslate}
                        disabled={isTranslating}
                        className="px-2.5 py-2 md:px-3 md:py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-bold text-xs transition-all whitespace-nowrap flex items-center gap-1"
                     >
                         {isTranslating ? (
                             <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                         ) : (
                             '翻译'
                         )}
                     </button>
                     <button
                        onClick={handleRussianReply}
                        disabled={isTranslating}
                        className="px-2.5 py-2 md:px-3 md:py-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/40 font-bold text-xs transition-all whitespace-nowrap flex items-center gap-1"
                     >
                         {isTranslating ? (
                             <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                         ) : (
                             '✨ 俄语'
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
                        onChange={(e) => handleInputTextChange(e.target.value)}
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
                                                    {(item.reading || item.ipa) && (
                                                        <div className="text-xs text-indigo-500 dark:text-indigo-400 font-mono mb-0.5">
                                                            {item.reading || item.ipa}
                                                        </div>
                                                    )}
                                                    <div className="text-sm text-gray-500 dark:text-gray-400">{item.cn}</div>
                                                    {item.ru && (
                                                        <div className="text-xs text-gray-400 dark:text-gray-500 italic mt-0.5">🇷🇺 {item.ru}</div>
                                                    )}
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
                                                    onClick={() => handlePlaySingleSentence(sent.text)}
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
                            aria-label={playButtonLabel}
                            title={playButtonLabel}
	                        className={`flex-none w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-500/30 transition-all ${
                            ttsStatus === 'playing' ? 'bg-red-500 hover:bg-red-600' : 'bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200'
                        }`}
                     >
                         {ttsStatus === 'loading' || isFetchingAudio.current ? (
                             <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                         ) : ttsStatus === 'playing' ? (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="7" y="4" width="3.5" height="16"></rect><rect x="13.5" y="4" width="3.5" height="16"></rect></svg>
                         ) : (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8.5 5.5l10 7-10 7V5.5z"></path></svg>
                         )}
                     </button>
                     {(ttsStatus !== 'idle' || isFetchingAudio.current) && (
                         <button
                            onClick={stopTTS}
                            aria-label="停止朗读"
                            title="停止朗读并清除当前播放队列"
                            className="flex-none w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300 transition-colors"
                         >
                             <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1.5"></rect></svg>
                         </button>
                     )}
                     
                     <div className="flex-1 min-w-0 flex flex-col justify-center">
                         <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-2">
                             {settings.shadowingMode && <span className="bg-green-100 text-green-700 px-1.5 rounded text-[10px]">跟读开启</span>}
                             {ttsStatus === 'paused' ? (
                                 <span className="text-orange-500 animate-pulse">⏸ 已暂停</span>
                             ) : playMode === 'select' ? `播放选中 (${selRange.end - selRange.start}字)` :
                              playMode === 'continue' ? '从光标处播放' : '全文跟读'}
                              {playMode === 'select' && !ttsStatus && (
                                  <span className="text-[10px] text-blue-500 animate-pulse">✨ 保持选中可循环练习</span>
                              )}
                         </div>
                         
                         {/* Voice Selector */}
                         <div className="flex items-center gap-2 w-full">
                                <div className="relative flex-1">
                                    <select 
                                        aria-label="选择语音"
	                                        value={
	                                            settings.ttsProvider === 'siliconflow' ? settings.sfTtsVoice :
                                            settings.ttsProvider === 'azure' ? settings.azureVoice :
                                                settings.ttsProvider === 'edge' ? settings.edgeVoice :
	                                            settings.browserVoice
	                                        }
                                        onChange={(e) => handleVoiceChange(e.target.value)}
                                        className="w-full bg-transparent font-bold text-gray-900 dark:text-white text-sm focus:outline-none appearance-none pr-8 cursor-pointer truncate"
                                    >
                                        {settings.ttsProvider === 'siliconflow' && SF_VOICES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                                        {settings.ttsProvider === 'azure' && AZURE_VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                                        {settings.ttsProvider === 'edge' && EDGE_TTS_VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
	                                        {isBrowserProvider(settings.ttsProvider) && (
	                                            <>
	                                                <option value="">
                                                        {voicesLoading
                                                            ? '正在加载音色...'
                                                            : '系统默认音色'}
                                                    </option>
	                                                {uiVoices.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
	                                            </>
	                                        )}
                                    </select>
                                    <svg className="w-4 h-4 text-gray-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                                
                                {(isBrowserProvider(settings.ttsProvider) || settings.ttsProvider === 'azure' || settings.ttsProvider === 'edge') && (
                                    <button 
                                        onClick={() => {
                                            if (settings.ttsProvider === 'azure') {
                                                alert("Azure 是正式微软云端合成，需要用户自己的 Azure Key。");
                                            } else if (settings.ttsProvider === 'edge') {
                                                alert("Edge 免费云端使用非官方 Edge Read Aloud 接口，免用户 Key，但会经过本项目 /api/edge-tts 转发；它不是微软公开 API，可能失效。");
                                            } else {
                                                setShowIosGuide(true);
                                            }
                                        }}
                                        className="p-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 flex-none"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    </button>
                                )}
                             </div>
                     </div>

                     {/* Action Buttons */}
                     {audioUrl && !isBrowserProvider(settings.ttsProvider) && (
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
	                 <div className="flex items-center gap-3 px-1">
	                         <span className="text-xs font-bold text-gray-400 w-8">0.5x</span>
	                         <input 
                             type="range" min="0.5" max="1.5" step="0.1"
                             value={settings.ttsSpeed}
                             onChange={(e) => {
                                stopTTSIfActive();
                                onSettingsChange({ ...settings, ttsSpeed: parseFloat(e.target.value) });
                             }}
                             className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-black dark:accent-white"
	                         />
	                         <span className="text-xs font-bold text-gray-400 w-8 text-right">1.5x</span>
	                         <span className="text-xs font-mono font-medium text-gray-900 dark:text-white min-w-[32px] text-center bg-gray-100 dark:bg-gray-800 rounded px-1">{settings.ttsSpeed.toFixed(1)}x</span>
	                 </div>
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
