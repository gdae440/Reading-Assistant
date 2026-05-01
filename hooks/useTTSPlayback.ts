import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings } from '../types';
import { AzureTTSService } from '../services/azureTTS';
import { EdgeCloudTTSService } from '../services/edgeTTSClient';
import { SiliconFlowService } from '../services/siliconFlow';
import { splitBrowserSpeechSegments, splitTextIntoSentences } from '../utils/textSegmentation';
import { buildTTSCacheKey, saveLimitedAudioUrl } from '../utils/ttsCache';
import { readCachedAudio, writeCachedAudio } from '../utils/audioBlobCache';

export type TTSStatus = 'idle' | 'loading' | 'playing' | 'paused';
export type PlayMode = 'all' | 'select' | 'continue';

interface TextRange {
  start: number;
  end: number;
}

interface PlaybackTextSelection {
  textToPlay: string;
  fallbackToAll: boolean;
}

export interface PlaybackSentence {
  text: string;
}

export interface IndexedPlaybackSentence extends PlaybackSentence {
  originalIndex: number;
}

interface EstimatedSentenceTimelineItem {
  sentence: IndexedPlaybackSentence;
  startRatio: number;
  endRatio: number;
}

interface UseTTSPlaybackOptions {
  inputText: string;
  settings: AppSettings;
  detectedLang: string;
  playMode: PlayMode;
  selRange: TextRange;
  sfService: SiliconFlowService;
  edgeService: EdgeCloudTTSService;
  onPlayModeFallbackToAll: () => void;
}

export const isBrowserProvider = (provider: AppSettings['ttsProvider']) =>
  provider === 'browser';

export const isNoveltyVoice = (voice: SpeechSynthesisVoice): boolean => {
  const name = voice.name.toLowerCase();
  return [
    'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged',
    'good news', 'hysterical', 'jester', 'organ', 'superstar', 'trinoids',
    'whisper', 'zarvox'
  ].some(blocked => name.includes(blocked));
};

export const browserLangMatches = (voiceLang: string, detectedLang: string): boolean => {
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

const hasMeaningfulSpeechText = (text: string) =>
  /[a-zA-Z\u00C0-\u00FF\u0400-\u04FF\u4e00-\u9fa5\u3040-\u30ff\u3400-\u4dbf]/.test(text);

export const selectTTSPlaybackText = (
  inputText: string,
  playMode: PlayMode,
  selRange: TextRange
): PlaybackTextSelection => {
  if (playMode !== 'select' && playMode !== 'continue') {
    return { textToPlay: inputText, fallbackToAll: false };
  }

  const start = selRange.start;
  const end = selRange.end > start ? selRange.end : inputText.length;
  const segment = inputText.slice(start, end).trim();

  if (segment && hasMeaningfulSpeechText(segment)) {
    return { textToPlay: segment, fallbackToAll: false };
  }

  return { textToPlay: inputText, fallbackToAll: true };
};

export const buildPlaybackSentences = (text: string): PlaybackSentence[] => {
  const sentences = splitTextIntoSentences(text)
    .map(sentence => sentence.trim())
    .filter(sentence => hasMeaningfulSpeechText(sentence));

  return sentences.length > 0 ? sentences.map(sentence => ({ text: sentence })) : [];
};

export const buildIndexedPlaybackSentences = (text: string): IndexedPlaybackSentence[] =>
  buildPlaybackSentences(text).map((sentence, index) => ({ ...sentence, originalIndex: index }));

export const buildPlaybackTextFromSentences = (sentences: PlaybackSentence[]) =>
  sentences.map(sentence => sentence.text).join(' ');

export const buildPlaybackFromSentenceIndex = (text: string, startIndex: number) => {
  const allSentences = buildIndexedPlaybackSentences(text);
  const safeStartIndex = Number.isFinite(startIndex)
    ? Math.min(Math.max(0, Math.floor(startIndex)), allSentences.length)
    : 0;

  const sentences = allSentences.slice(safeStartIndex);
  return {
    allSentences,
    sentences,
    textToPlay: buildPlaybackTextFromSentences(sentences)
  };
};

export const shouldUseSentenceLevelPlayback = (
  provider: AppSettings['ttsProvider'],
  shadowingMode: boolean
) => shadowingMode || isBrowserProvider(provider);

export const buildEstimatedSentenceTimeline = (
  sentences: IndexedPlaybackSentence[]
): EstimatedSentenceTimelineItem[] => {
  const weights = sentences.map(sentence => Math.max(1, sentence.text.length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) return [];

  let cursor = 0;
  return sentences.map((sentence, index) => {
    const startRatio = cursor / totalWeight;
    cursor += weights[index];
    return {
      sentence,
      startRatio,
      endRatio: cursor / totalWeight
    };
  });
};

export const sentenceIndexAtPlaybackTime = (
  timeline: EstimatedSentenceTimelineItem[],
  currentTime: number,
  duration: number
): number | null => {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return null;
  if (timeline.length === 0) return null;

  const ratio = Math.min(0.999999, Math.max(0, currentTime / duration));
  const item = timeline.find(entry => ratio >= entry.startRatio && ratio < entry.endRatio);
  return item?.sentence.originalIndex ?? timeline[timeline.length - 1].sentence.originalIndex;
};

export const estimatedSentenceRatioRange = (
  timeline: EstimatedSentenceTimelineItem[],
  originalIndex: number
) => {
  const item = timeline.find(entry => entry.sentence.originalIndex === originalIndex);
  return item ? { startRatio: item.startRatio, endRatio: item.endRatio } : null;
};

const languageCodeFor = (detectedLang: string) => {
  const langMap: Record<string, string> = {
    zh: 'zh-CN',
    ja: 'ja-JP',
    ru: 'ru-RU',
    en: 'en-US'
  };
  return langMap[detectedLang] || 'en-US';
};

export const useTTSPlayback = ({
  inputText,
  settings,
  detectedLang,
  playMode,
  selRange,
  sfService,
  edgeService,
  onPlayModeFallbackToAll
}: UseTTSPlaybackOptions) => {
  const [ttsStatus, setTtsStatus] = useState<TTSStatus>('idle');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentSentenceText, setCurrentSentenceText] = useState<string | null>(null);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number | null>(null);
  const [totalSentences, setTotalSentences] = useState(0);
  const [isSingleSentenceLoop, setIsSingleSentenceLoop] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioCache = useRef<Map<string, string>>(new Map());
  const isFetchingAudio = useRef(false);
  const isStoppedRef = useRef(false);
  const ttsStatusRef = useRef<TTSStatus>('idle');
  const playbackRevisionRef = useRef(0);
  const activeSpeechResolveRef = useRef<(() => void) | null>(null);
  const activeAudioResolveRef = useRef<(() => void) | null>(null);
  const singleSentenceLoopRef = useRef(isSingleSentenceLoop);

  useEffect(() => {
    ttsStatusRef.current = ttsStatus;
  }, [ttsStatus]);

  useEffect(() => {
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);

  useEffect(() => {
    singleSentenceLoopRef.current = isSingleSentenceLoop;
  }, [isSingleSentenceLoop]);

  const getAudioFromCache = useCallback((key: string) => audioCache.current.get(key), []);

  const saveAudioToCache = useCallback((key: string, url: string) => {
    saveLimitedAudioUrl(audioCache.current, key, url);
  }, []);

  const beginTTSRun = useCallback(() => {
    const nextRevision = playbackRevisionRef.current + 1;
    playbackRevisionRef.current = nextRevision;
    isStoppedRef.current = false;
    return nextRevision;
  }, []);

  const isTTSRunCurrent = useCallback((revision: number) => {
    return playbackRevisionRef.current === revision && !isStoppedRef.current;
  }, []);

  const stopTTS = useCallback(() => {
    playbackRevisionRef.current += 1;
    isStoppedRef.current = true;

    activeSpeechResolveRef.current?.();
    activeSpeechResolveRef.current = null;

    activeAudioResolveRef.current?.();
    activeAudioResolveRef.current = null;

    if (audioRef.current) {
      audioRef.current.onloadedmetadata = null;
      audioRef.current.ontimeupdate = null;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    window.speechSynthesis.cancel();
    setTtsStatus('idle');
    setCurrentSentenceText(null);
    setCurrentSentenceIndex(null);
    setTotalSentences(0);
    isFetchingAudio.current = false;
  }, []);

  const stopTTSIfActive = useCallback(() => {
    if (ttsStatusRef.current !== 'idle' || isFetchingAudio.current) {
      stopTTS();
    }
  }, [stopTTS]);

  const pauseTTS = useCallback(() => {
    if (isBrowserProvider(settings.ttsProvider)) {
      window.speechSynthesis.pause();
      setTtsStatus('paused');
      return;
    }

    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setTtsStatus('paused');
    }
  }, [settings.ttsProvider]);

  const resumeTTS = useCallback(() => {
    if (isBrowserProvider(settings.ttsProvider)) {
      window.speechSynthesis.resume();
      setTtsStatus('playing');
      return;
    }

    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play().catch(console.error);
      setTtsStatus('playing');
    }
  }, [settings.ttsProvider]);

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
  }, [ttsConfigSignature, stopTTSIfActive]);

  const previousInputTextRef = useRef(inputText);
  useEffect(() => {
    if (previousInputTextRef.current !== inputText) {
      stopTTSIfActive();
      previousInputTextRef.current = inputText;
    }
  }, [inputText, stopTTSIfActive]);

  const playOneSegment = useCallback(async (
    text: string,
    playbackRevision: number,
    onAudioProgress?: (currentTime: number, duration: number) => void,
    startRatio = 0,
    endRatio?: number
  ): Promise<void> => {
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

        const freshVoices = window.speechSynthesis.getVoices() || [];
        const targetLang = languageCodeFor(detectedLang);
        const selectedVoiceURI = settings.browserVoice;

        if (selectedVoiceURI) {
          const cleanName = selectedVoiceURI.replace('missing:', '');
          let candidate: SpeechSynthesisVoice | undefined;

          candidate = freshVoices.find(v => v.voiceURI === selectedVoiceURI);

          if (!candidate) {
            const namePatterns = [
              cleanName,
              cleanName.replace(/\s+(Enhanced|Premium)$/, ''),
              cleanName.replace(/\s+\d+$/, '')
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

          if (!candidate && freshVoices.length > 0) {
            const matchingVoices = freshVoices.filter(v => browserLangMatches(v.lang || '', detectedLang) && !isNoveltyVoice(v));
            const preferredVoices = matchingVoices.filter(v => v.localService);
            const langVoices = preferredVoices.length > 0 ? preferredVoices : matchingVoices;
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
            uttr.lang = candidate.lang || targetLang;
            console.log(`[TTS] 使用语音: ${candidate.name} (${candidate.lang})`);
          } else {
            uttr.lang = targetLang;
            console.log(`[TTS] 未找到 ${cleanName}，使用默认 ${targetLang}`);
          }
        } else {
          uttr.lang = targetLang;
        }

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

    const cacheKey = buildTTSCacheKey(text, settings);
    let url = getAudioFromCache(cacheKey);

    if (!url) {
      if (isFetchingAudio.current) return;
      isFetchingAudio.current = true;
      try {
        let audioData = await readCachedAudio(cacheKey);
        if (!audioData) {
          const fetchPromise = (async () => {
            if (settings.ttsProvider === 'siliconflow') {
              if (!settings.apiKey) throw new Error('缺少 Key');
              return await sfService.generateSpeech(text, settings.sfTtsModel, settings.sfTtsVoice, settings.ttsSpeed);
            } else if (settings.ttsProvider === 'edge') {
              return await edgeService.generateSpeech(text, settings.edgeVoice, settings.ttsSpeed);
            } else {
              if (!settings.azureKey) throw new Error('缺少 Key');
              const azure = new AzureTTSService(settings.azureKey, settings.azureRegion);
              return await azure.generateSpeech(text, settings.azureVoice, settings.ttsSpeed);
            }
          })();

          const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('请求超时 (CosyVoice2 生成较慢，请稍候)')), 60000));
          audioData = await Promise.race([fetchPromise, timeoutPromise]);
          await writeCachedAudio(cacheKey, audioData.slice(0));
        }

        if (!isTTSRunCurrent(playbackRevision)) return;

        const blob = new Blob([audioData], { type: 'audio/mp3' });
        url = URL.createObjectURL(blob);
        saveAudioToCache(cacheKey, url);
      } catch (err: any) {
        if (err.message === 'Azure_429') alert('请求过于频繁 (Azure 限制)，请稍后再试');
        else alert(err.message || 'TTS Error');
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
        const boundedStartRatio = Math.min(0.999999, Math.max(0, startRatio));
        const boundedEndRatio = typeof endRatio === 'number'
          ? Math.min(1, Math.max(boundedStartRatio, endRatio))
          : null;
        const needsInitialSeek = boundedStartRatio > 0;
        let didStart = false;
        let didSeek = false;
        let didFinish = false;

        const cleanup = () => {
          audio.onloadedmetadata = null;
          audio.ontimeupdate = null;
          audio.onended = null;
          audio.onerror = null;
        };

        const finish = () => {
          if (didFinish) return;
          didFinish = true;
          cleanup();
          if (activeAudioResolveRef.current === finish) {
            activeAudioResolveRef.current = null;
          }
          resolve();
        };
        activeAudioResolveRef.current = finish;

        const applyInitialSeek = () => {
          if (didSeek || !needsInitialSeek) return;
          if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
          audio.currentTime = audio.duration * boundedStartRatio;
          didSeek = true;
          onAudioProgress?.(audio.currentTime, audio.duration);
        };

        const startAudio = () => {
          if (didStart || !isTTSRunCurrent(playbackRevision)) return;
          didStart = true;
          applyInitialSeek();
          setTtsStatus('playing');
          audio.play().catch((err) => {
            setTtsStatus('idle');
            reject(err);
          });
        };

        audio.onloadedmetadata = startAudio;
        audio.ontimeupdate = () => {
          applyInitialSeek();
          onAudioProgress?.(audio.currentTime, audio.duration);
          if (
            boundedEndRatio !== null &&
            Number.isFinite(audio.duration) &&
            audio.duration > 0 &&
            audio.currentTime >= audio.duration * boundedEndRatio
          ) {
            audio.pause();
            onAudioProgress?.(audio.duration * boundedEndRatio, audio.duration);
            finish();
          }
        };
        audio.onended = () => {
          onAudioProgress?.(audio.duration, audio.duration);
          finish();
        };
        audio.onerror = (e) => {
          activeAudioResolveRef.current = null;
          cleanup();
          reject(e);
        };

        if (!needsInitialSeek || audio.readyState >= 1) {
          startAudio();
        }
      });
    }
  }, [
    detectedLang,
    edgeService,
    getAudioFromCache,
    isTTSRunCurrent,
    saveAudioToCache,
    settings,
    sfService
  ]);

  const playSentenceSequence = useCallback(async (
    sentences: IndexedPlaybackSentence[],
    playbackRevision: number,
    totalSentenceCount: number,
    shouldLoop: () => boolean
  ) => {
    setTotalSentences(totalSentenceCount);
    if (settings.shadowingMode) {
      setTtsStatus('playing');
    }

    do {
      try {
        for (const sentence of sentences) {
          if (!isTTSRunCurrent(playbackRevision)) break;
          setCurrentSentenceIndex(sentence.originalIndex);
          setCurrentSentenceText(sentence.text);

          if (settings.shadowingMode) {
            await playOneSegment(sentence.text, playbackRevision);

            if (!isTTSRunCurrent(playbackRevision)) break;

            await new Promise(resolve => {
              setTimeout(resolve, settings.shadowingPause * 1000);
            });
          } else if (isBrowserProvider(settings.ttsProvider)) {
            const segments = splitBrowserSpeechSegments(sentence.text);
            for (const segment of segments) {
              if (!isTTSRunCurrent(playbackRevision)) break;
              await playOneSegment(segment, playbackRevision);
            }
          } else {
            await playOneSegment(sentence.text, playbackRevision);
          }
        }
      } catch (err) {
        if (settings.shadowingMode) console.error('Playback error', err);
        break;
      }
    } while (isTTSRunCurrent(playbackRevision) && shouldLoop());

    if (isTTSRunCurrent(playbackRevision)) {
      setTtsStatus('idle');
      setCurrentSentenceText(null);
      setCurrentSentenceIndex(null);
    }
  }, [
    isTTSRunCurrent,
    playOneSegment,
    settings.shadowingMode,
    settings.shadowingPause,
    settings.ttsProvider
  ]);

  const playText = useCallback(async (textToPlay: string) => {
    stopTTS();
    const playbackRevision = beginTTSRun();
    setTtsStatus(settings.shadowingMode ? 'playing' : 'loading');
    const sentences = buildIndexedPlaybackSentences(textToPlay);
    setCurrentSentenceIndex(null);
    setCurrentSentenceText(null);

    if (!shouldUseSentenceLevelPlayback(settings.ttsProvider, settings.shadowingMode)) {
      setTotalSentences(sentences.length);
      const timeline = buildEstimatedSentenceTimeline(sentences);
      const updateEstimatedCurrentSentence = (currentTime: number, duration: number) => {
        const originalIndex = sentenceIndexAtPlaybackTime(timeline, currentTime, duration);
        if (originalIndex === null) return;
        const sentence = sentences.find(item => item.originalIndex === originalIndex);
        if (!sentence) return;
        setCurrentSentenceIndex(originalIndex);
        setCurrentSentenceText(sentence.text);
      };
      try {
        await playOneSegment(textToPlay, playbackRevision, updateEstimatedCurrentSentence);
      } catch {
        // Provider errors are surfaced inside playOneSegment.
      } finally {
        if (isTTSRunCurrent(playbackRevision)) {
          setTtsStatus('idle');
          setCurrentSentenceText(null);
          setCurrentSentenceIndex(null);
        }
      }
      return;
    }

    await playSentenceSequence(sentences, playbackRevision, sentences.length, () => false);
  }, [
    beginTTSRun,
    isTTSRunCurrent,
    playOneSegment,
    playSentenceSequence,
    settings.shadowingMode,
    settings.ttsProvider,
    stopTTS
  ]);

  const handleTTS = useCallback(async () => {
    if (!inputText.trim()) return;

    if (ttsStatus === 'paused') {
      resumeTTS();
      return;
    }

    if (ttsStatus === 'playing') {
      pauseTTS();
      return;
    }

    const { textToPlay, fallbackToAll } = selectTTSPlaybackText(inputText, playMode, selRange);
    if (fallbackToAll) {
      onPlayModeFallbackToAll();
    }

    await playText(textToPlay);
  }, [
    inputText,
    onPlayModeFallbackToAll,
    pauseTTS,
    playMode,
    playText,
    resumeTTS,
    selRange,
    ttsStatus
  ]);

  const playSingleText = useCallback(async (text: string, sentenceIndex?: number, sentenceTotal?: number) => {
    if (!text.trim()) return;
    stopTTS();
    const playbackRevision = beginTTSRun();
    setTtsStatus('loading');
    setTotalSentences(sentenceTotal ?? 1);
    setCurrentSentenceIndex(sentenceIndex ?? 0);
    setCurrentSentenceText(text.trim());
    try {
      const allSentences = buildIndexedPlaybackSentences(inputText);
      const sourceSentence = typeof sentenceIndex === 'number' ? allSentences[sentenceIndex] : null;
      const canUseFullAudioSeek =
        !shouldUseSentenceLevelPlayback(settings.ttsProvider, settings.shadowingMode) &&
        sourceSentence?.text === text.trim();

      if (canUseFullAudioSeek && sourceSentence) {
        const timeline = buildEstimatedSentenceTimeline(allSentences);
        const range = estimatedSentenceRatioRange(timeline, sourceSentence.originalIndex);
        if (range) {
          const updateEstimatedCurrentSentence = (currentTime: number, duration: number) => {
            const originalIndex = sentenceIndexAtPlaybackTime(timeline, currentTime, duration);
            if (originalIndex === null) return;
            const sentence = allSentences.find(item => item.originalIndex === originalIndex);
            if (!sentence) return;
            setCurrentSentenceIndex(originalIndex);
            setCurrentSentenceText(sentence.text);
          };

          setTotalSentences(allSentences.length);
          do {
            await playOneSegment(
              inputText,
              playbackRevision,
              updateEstimatedCurrentSentence,
              range.startRatio,
              range.endRatio
            );
          } while (isTTSRunCurrent(playbackRevision) && singleSentenceLoopRef.current);
          return;
        }
      }

      do {
        await playOneSegment(text, playbackRevision);
      } while (isTTSRunCurrent(playbackRevision) && singleSentenceLoopRef.current);
    } catch {
      // playOneSegment already surfaces provider errors.
    } finally {
      if (isTTSRunCurrent(playbackRevision)) {
        setTtsStatus('idle');
        setCurrentSentenceText(null);
        setCurrentSentenceIndex(null);
      }
    }
  }, [
    beginTTSRun,
    inputText,
    isTTSRunCurrent,
    playOneSegment,
    settings.shadowingMode,
    settings.ttsProvider,
    stopTTS
  ]);

  const playFromSentenceIndex = useCallback(async (startIndex: number) => {
    const allSentences = buildIndexedPlaybackSentences(inputText);
    const sourceSentence = allSentences[startIndex];
    if (!sourceSentence) return;

    stopTTS();
    const playbackRevision = beginTTSRun();
    setTtsStatus(settings.shadowingMode ? 'playing' : 'loading');
    setTotalSentences(allSentences.length);
    setCurrentSentenceIndex(sourceSentence.originalIndex);
    setCurrentSentenceText(sourceSentence.text);

    if (!shouldUseSentenceLevelPlayback(settings.ttsProvider, settings.shadowingMode)) {
      const timeline = buildEstimatedSentenceTimeline(allSentences);
      const range = estimatedSentenceRatioRange(timeline, sourceSentence.originalIndex);
      if (!range) {
        if (isTTSRunCurrent(playbackRevision)) setTtsStatus('idle');
        return;
      }

      const updateEstimatedCurrentSentence = (currentTime: number, duration: number) => {
        const originalIndex = sentenceIndexAtPlaybackTime(timeline, currentTime, duration);
        if (originalIndex === null) return;
        const sentence = allSentences.find(item => item.originalIndex === originalIndex);
        if (!sentence) return;
        setCurrentSentenceIndex(originalIndex);
        setCurrentSentenceText(sentence.text);
      };

      try {
        await playOneSegment(
          inputText,
          playbackRevision,
          updateEstimatedCurrentSentence,
          range.startRatio
        );
      } catch {
        // Provider errors are surfaced inside playOneSegment.
      } finally {
        if (isTTSRunCurrent(playbackRevision)) {
          setTtsStatus('idle');
          setCurrentSentenceText(null);
          setCurrentSentenceIndex(null);
        }
      }
      return;
    }

    const { sentences } = buildPlaybackFromSentenceIndex(inputText, startIndex);
    await playSentenceSequence(sentences, playbackRevision, allSentences.length, () => false);
  }, [
    beginTTSRun,
    inputText,
    isTTSRunCurrent,
    playOneSegment,
    playSentenceSequence,
    settings.shadowingMode,
    settings.ttsProvider,
    stopTTS
  ]);

  useEffect(() => {
    return () => {
      stopTTS();
      const currentAudioUrl = audioUrlRef.current;
      if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
      for (const url of audioCache.current.values()) {
        URL.revokeObjectURL(url);
      }
      isFetchingAudio.current = false;
    };
  }, [stopTTS]);

  return {
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
    pauseTTS,
    resumeTTS,
    playSingleText,
    playFromSentenceIndex
  };
};
