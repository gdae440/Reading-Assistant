
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AppSettings, WordEntry, HistoryEntry } from '../types';
import { SiliconFlowService } from '../services/siliconFlow';
import { EdgeCloudTTSService } from '../services/edgeTTSClient';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { PlaybackControls } from '../components/PlaybackControls';
import { ReaderContent } from '../components/ReaderContent';
import { ReaderTextArea } from '../components/ReaderTextArea';
import { ReaderToolbar } from '../components/ReaderToolbar';
import { WordDetailModal } from '../components/WordDetailModal';
import { useLocalStorage } from '../hooks/useLocalStorage';
import {
    browserLangMatches,
    buildPlaybackSentences,
    isBrowserProvider,
    isNoveltyVoice,
    useTTSPlayback
} from '../hooks/useTTSPlayback';
import { useTextAnalysis } from '../hooks/useTextAnalysis';
import { useWordLookup } from '../hooks/useWordLookup';

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

interface Props {
  vocab: WordEntry[];
  settings: AppSettings;
  onAddToVocab: (entry: WordEntry) => void;
  onUpdateVocabEntry: (id: string, updates: Partial<WordEntry>) => void;
  onSettingsChange: (settings: AppSettings) => void;
  onAddToHistory: (entry: HistoryEntry) => void;
}

export const ReaderView: React.FC<Props> = ({ vocab, settings, onAddToVocab, onSettingsChange, onAddToHistory }) => {
  // Persistence
  const [inputText, setInputText] = useLocalStorage("reader_text", "");
  
  const [isReaderMode, setIsReaderMode] = useState(false);
  const [isBlindMode, setIsBlindMode] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  
  // Play Modes
  const [playMode, setPlayMode] = useState<'all' | 'select' | 'continue'>('all');
  const [selRange, setSelRange] = useState({ start: 0, end: 0 });
  const [continueFromSentenceIndex, setContinueFromSentenceIndex] = useState<number | null>(null);

  const { voices: browserVoices, isLoading: voicesLoading } = useBrowserVoices();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sfService = useMemo(() => new SiliconFlowService(settings.apiKey), [settings.apiKey]);
  const edgeService = useMemo(() => new EdgeCloudTTSService(), []);
  const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);

  // Detect Language
  const detectedLang = useMemo(() => {
    const textSample = inputText.slice(0, 300);
    // Priority: Japanese -> Russian -> Chinese -> English
    if (/[\u3040-\u30ff\u3400-\u4dbf]/.test(textSample)) return 'ja';
    if (/[а-яА-ЯЁё]/.test(textSample)) return 'ru';
    if (/[\u4e00-\u9fa5]/.test(textSample)) return 'zh';
    return 'en';
  }, [inputText]);

  const {
    ttsStatus,
    audioUrl,
    currentSentenceText,
    currentSentenceIndex,
    totalSentences,
    isSingleSentenceLoop,
    setIsSingleSentenceLoop,
    isFetchingAudio,
    handleTTS,
    stopTTS,
    stopTTSIfActive,
    playSingleText,
    playFromSentenceIndex
  } = useTTSPlayback({
    inputText,
    settings,
    detectedLang,
    playMode,
    selRange,
    sfService,
    edgeService,
    onPlayModeFallbackToAll: () => setPlayMode('all')
  });

  useEffect(() => {
    if (ttsStatus === 'loading' || ttsStatus === 'playing' || ttsStatus === 'paused') {
        setIsReaderMode(true);
    }
  }, [ttsStatus]);

  const {
    lookupData,
    modalPosition,
    isLookupLoading,
    isSavedWord,
    closeLookup,
    handleWordClick
  } = useWordLookup({
    vocab,
    apiKey: settings.apiKey,
    llmModel: settings.llmModel,
    detectedLang,
    sfService,
    onAddToVocab
  });

  const {
    translationResult,
    setTranslationResult,
    analysisResult,
    isAnalysisCollapsed,
    setIsAnalysisCollapsed,
    addedAnalysisItems,
    isTranslating,
    isAnalyzing,
    handleTranslate,
    handleRussianReply,
    handleAnalyze,
    handleExportAnalysis,
    addAnalysisItemToVocab
  } = useTextAnalysis({
    inputText,
    settings,
    sfService,
    onAddToHistory,
    onAddToVocab
  });

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

  const playbackSentences = useMemo(() => buildPlaybackSentences(inputText), [inputText]);

  const playSentenceWithSourceIndex = (text: string, index?: number) => {
    const sourceIndex = index ?? playbackSentences.findIndex(sentence => sentence.text === text.trim());
    setContinueFromSentenceIndex(sourceIndex >= 0 ? sourceIndex : null);
    playSingleText(
        text,
        sourceIndex >= 0 ? sourceIndex : undefined,
        sourceIndex >= 0 ? playbackSentences.length : undefined
    );
  };


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

  const handleInputTextChange = (value: string) => {
      stopTTSIfActive();
      setContinueFromSentenceIndex(null);
      setInputText(value);
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

  const handleVoiceInfo = () => {
    if (settings.ttsProvider === 'azure') {
        alert("Azure 是正式微软云端合成，需要用户自己的 Azure Key。");
    } else if (settings.ttsProvider === 'edge') {
        alert("Edge 免费云端使用非官方 Edge Read Aloud 接口，免用户 Key，但会经过本项目 /api/edge-tts 转发；它不是微软公开 API，可能失效。");
    } else {
        setShowIosGuide(true);
    }
  };

  const playButtonLabel =
    ttsStatus === 'loading' ? '正在准备朗读' :
    ttsStatus === 'playing' ? '暂停朗读' :
    ttsStatus === 'paused' ? '继续朗读' :
    continueFromSentenceIndex !== null ? `从第 ${continueFromSentenceIndex + 1} 句继续朗读` :
    '开始朗读';

  const handlePlaybackButton = () => {
    if (ttsStatus === 'idle' && continueFromSentenceIndex !== null) {
        const startIndex = continueFromSentenceIndex;
        setContinueFromSentenceIndex(null);
        playFromSentenceIndex(startIndex);
        return;
    }

    handleTTS();
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] max-w-5xl mx-auto relative" onClick={closeLookup}>
        <ReaderToolbar
            isReaderMode={isReaderMode}
            isBlindMode={isBlindMode}
            isAnalyzing={isAnalyzing}
            isTranslating={isTranslating}
            ocrLoading={ocrLoading}
            ocrStatus={ocrStatus}
            fileInputRef={fileInputRef}
            onToggleReaderMode={() => setIsReaderMode(!isReaderMode)}
            onToggleBlindMode={() => setIsBlindMode(!isBlindMode)}
            onAnalyze={handleAnalyze}
            onFileUpload={handleFileUpload}
            onTranslate={handleTranslate}
            onRussianReply={handleRussianReply}
        />

        {/* Main Text Area - INCREASED PADDING & SPACER */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-96">
            <div className={`bg-white dark:bg-[#1c1c1e] rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 p-6 md:p-8 min-h-[60vh] relative transition-all duration-500 ${isBlindMode ? 'blur-md opacity-60 select-none' : ''}`}>
                {isReaderMode ? (
                    <div className="prose dark:prose-invert max-w-none">
                        <ReaderContent
                            inputText={inputText}
                            sentences={analysisResult?.sentences || []}
                            currentSentenceIndex={currentSentenceIndex}
                            currentSentenceText={currentSentenceText}
                            isSavedWord={isSavedWord}
                            onWordClick={handleWordClick}
                        />
                    </div>
                ) : (
                    <ReaderTextArea
                        textareaRef={textareaRef}
                        value={inputText}
                        onChange={handleInputTextChange}
                        onSelectionChange={updatePlayMode}
                    />
                )}
            </div>
            
            {analysisResult && (
                <AnalysisPanel
                    analysisResult={analysisResult}
                    isCollapsed={isAnalysisCollapsed}
                    addedItems={addedAnalysisItems}
                    onToggleCollapsed={() => setIsAnalysisCollapsed(!isAnalysisCollapsed)}
                    onExport={handleExportAnalysis}
                    onAddItem={addAnalysisItemToVocab}
                    onPlaySentence={playSentenceWithSourceIndex}
                />
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
            <div className="h-48 md:h-52 w-full" aria-hidden="true" />
        </div>

        <PlaybackControls
            settings={settings}
            ttsStatus={ttsStatus}
            isFetchingAudio={isFetchingAudio.current}
            playMode={playMode}
            selRange={selRange}
            audioUrl={audioUrl}
            playButtonLabel={playButtonLabel}
            currentSentenceIndex={currentSentenceIndex}
            currentSentenceText={currentSentenceText}
            totalSentences={totalSentences}
            playbackSentences={playbackSentences}
            continueFromSentenceIndex={continueFromSentenceIndex}
            isSingleSentenceLoop={isSingleSentenceLoop}
            browserVoicesLoading={voicesLoading}
            browserVoiceOptions={uiVoices}
            onPlay={handlePlaybackButton}
            onStop={stopTTS}
            onVoiceChange={handleVoiceChange}
            onShowVoiceInfo={handleVoiceInfo}
            onSpeedChange={(speed) => {
                stopTTSIfActive();
                onSettingsChange({ ...settings, ttsSpeed: speed });
            }}
            onPlaySentence={playSentenceWithSourceIndex}
            onToggleSingleSentenceLoop={() => setIsSingleSentenceLoop(!isSingleSentenceLoop)}
        />
        
        {/* Modals */}
        <WordDetailModal 
            data={lookupData} 
            isLoading={isLookupLoading} 
            position={modalPosition}
            onClose={closeLookup}
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
