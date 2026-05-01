import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import type { AppSettings } from '../types';
import type { PlayMode, TTSStatus } from '../hooks/useTTSPlayback';
import { isBrowserProvider } from '../hooks/useTTSPlayback';
import { VoiceSelector, type VoiceOption } from './VoiceSelector';

interface PlaybackControlsProps {
  settings: AppSettings;
  ttsStatus: TTSStatus;
  isFetchingAudio: boolean;
  playMode: PlayMode;
  selRange: { start: number; end: number };
  audioUrl: string | null;
  playButtonLabel: string;
  currentSentenceIndex: number | null;
  currentSentenceText: string | null;
  totalSentences: number;
  playbackSentences: Array<{ text: string }>;
  continueFromSentenceIndex: number | null;
  isSingleSentenceLoop: boolean;
  browserVoicesLoading: boolean;
  browserVoiceOptions: VoiceOption[];
  onPlay: () => void;
  onStop: () => void;
  onVoiceChange: (value: string) => void;
  onShowVoiceInfo: () => void;
  onSpeedChange: (speed: number) => void;
  onPlaySentence: (text: string, index: number) => void;
  onToggleSingleSentenceLoop: () => void;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  settings,
  ttsStatus,
  isFetchingAudio,
  playMode,
  selRange,
  audioUrl,
  playButtonLabel,
  currentSentenceIndex,
  currentSentenceText,
  totalSentences,
  playbackSentences,
  continueFromSentenceIndex,
  isSingleSentenceLoop,
  browserVoicesLoading,
  browserVoiceOptions,
  onPlay,
  onStop,
  onVoiceChange,
  onShowVoiceInfo,
  onSpeedChange,
  onPlaySentence,
  onToggleSingleSentenceLoop
}) => {
  const sentenceScrollRef = useRef<HTMLDivElement | null>(null);
  const sentenceItemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const alignSentenceTrack = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const scrollContainer = sentenceScrollRef.current;
    if (!scrollContainer) return;

    const targetIndex = currentSentenceIndex ?? continueFromSentenceIndex;
    if (targetIndex === null) {
      scrollContainer.scrollTo({ left: 0, behavior });
      return;
    }

    const currentItem = sentenceItemRefs.current[targetIndex];
    if (!currentItem) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const itemRect = currentItem.getBoundingClientRect();
    const nextScrollLeft = scrollContainer.scrollLeft + itemRect.left - containerRect.left;

    scrollContainer.scrollTo({
      left: Math.max(0, nextScrollLeft),
      behavior
    });
  }, [continueFromSentenceIndex, currentSentenceIndex]);

  useEffect(() => {
    if (currentSentenceIndex === null && continueFromSentenceIndex === null) return;
    alignSentenceTrack('smooth');
  }, [alignSentenceTrack, continueFromSentenceIndex, currentSentenceIndex]);

  useEffect(() => {
    const scrollContainer = sentenceScrollRef.current;
    if (!scrollContainer) return;

    let frameId: number | null = null;
    const handleResize = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => alignSentenceTrack('auto'));
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(handleResize)
      : null;

    resizeObserver?.observe(scrollContainer);
    window.addEventListener('resize', handleResize);

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [alignSentenceTrack]);

  return (
    <div className="fixed bottom-4 left-3 right-3 md:bottom-6 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[min(960px,calc(100vw-2rem))] p-3 md:p-4 bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl rounded-[28px] shadow-2xl border border-black/5 dark:border-white/10 z-40 transition-all duration-300">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex items-center gap-2">
          <button
            onClick={onPlay}
            disabled={ttsStatus === 'loading' || isFetchingAudio}
            aria-label={playButtonLabel}
            title={playButtonLabel}
            className={`flex-none w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-500/25 transition-all ${
              ttsStatus === 'playing' ? 'bg-red-500 hover:bg-red-600' : 'bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200'
            }`}
          >
            {ttsStatus === 'loading' || isFetchingAudio ? (
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            ) : ttsStatus === 'playing' ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="7" y="4" width="3.5" height="16"></rect><rect x="13.5" y="4" width="3.5" height="16"></rect></svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8.5 5.5l10 7-10 7V5.5z"></path></svg>
            )}
          </button>

          {(ttsStatus !== 'idle' || isFetchingAudio) && (
            <button
              onClick={onStop}
              aria-label="停止朗读"
              title="停止朗读并清除当前播放队列"
              className="flex-none w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1.5"></rect></svg>
            </button>
          )}
          </div>

          <div className="min-w-0 flex flex-col justify-center gap-1">
            <div className="min-w-0 text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
              {settings.shadowingMode && <span className="bg-green-100 text-green-700 px-1.5 rounded text-[10px]">跟读开启</span>}
              {currentSentenceIndex !== null && totalSentences > 0 && (
                <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200 px-1.5 rounded text-[10px]">
                  {currentSentenceIndex + 1}/{totalSentences}
                </span>
              )}
              <span className="truncate">
                {ttsStatus === 'paused' ? (
                <span className="text-orange-500 animate-pulse">已暂停</span>
              ) : ttsStatus === 'idle' && continueFromSentenceIndex !== null ? (
                <span>已选第 {continueFromSentenceIndex + 1} 句，再点播放继续</span>
              ) : playMode === 'select' ? `播放选中 (${selRange.end - selRange.start}字)` :
                playMode === 'continue' ? '从光标处播放' : '全文跟读'}
              </span>
              {playMode === 'select' && !ttsStatus && (
                <span className="text-[10px] text-blue-500 animate-pulse">✨ 保持选中可循环练习</span>
              )}
            </div>

            <VoiceSelector
              settings={settings}
              browserVoicesLoading={browserVoicesLoading}
              browserVoiceOptions={browserVoiceOptions}
              onVoiceChange={onVoiceChange}
              onShowVoiceInfo={onShowVoiceInfo}
            />
          </div>

          <div className="flex items-center gap-1.5">
            {audioUrl && !isBrowserProvider(settings.ttsProvider) && (
              <a
                href={audioUrl}
                download={`speech_${Date.now()}.mp3`}
                className="w-10 h-10 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
                title="下载音频"
                aria-label="下载音频"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-[2.4rem_minmax(0,1fr)_2.4rem_3rem] items-center gap-2 md:gap-3 px-1">
          <span className="text-xs font-bold text-gray-400">0.5x</span>
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.1"
            value={settings.ttsSpeed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-black dark:accent-white"
          />
          <span className="text-xs font-bold text-gray-400 text-right">1.5x</span>
          <span className="text-xs font-mono font-medium text-gray-900 dark:text-white text-center bg-gray-100 dark:bg-gray-800 rounded-lg py-1">{settings.ttsSpeed.toFixed(1)}x</span>
        </div>

        {playbackSentences.length > 0 && (
          <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 px-1 min-w-0 h-11 overflow-hidden">
            <div className="flex items-center gap-1.5 h-11 min-w-0">
              <button
                type="button"
                onClick={onToggleSingleSentenceLoop}
                className={`h-10 shrink-0 rounded-lg px-3 text-[12px] leading-none font-bold transition-colors flex items-center gap-1.5 flex-none whitespace-nowrap border ${
                  isSingleSentenceLoop
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                }`}
                title="单句循环"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" />
                </svg>
                <span className="whitespace-nowrap">单句循环</span>
              </button>
            </div>
            <div className="w-px h-6 bg-gray-200 dark:bg-white/10" aria-hidden="true" />
            <div ref={sentenceScrollRef} className="h-11 min-w-0 overflow-x-auto overflow-y-hidden scrollbar-hide flex items-center">
              <div className="flex flex-nowrap items-center gap-1.5 h-10 w-max min-w-full">
                {playbackSentences.map((sentence, index) => {
                  const isCurrent =
                    currentSentenceIndex === index ||
                    Boolean(currentSentenceText && currentSentenceText === sentence.text);
                  const isPendingContinue = continueFromSentenceIndex === index && !isCurrent;
                  return (
                    <div
                      key={`${index}-${sentence.text.slice(0, 16)}`}
                      ref={(element) => { sentenceItemRefs.current[index] = element; }}
                      style={{
                        minWidth: 'clamp(132px, 10vw, 180px)',
                        maxWidth: 'clamp(240px, 30vw, 420px)'
                      }}
                      className={`flex-none w-fit h-10 rounded-lg flex items-center overflow-hidden border transition-colors ${
                        isCurrent
                          ? 'bg-blue-600 text-white border-blue-500'
                          : isPendingContinue
                            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-100 border-blue-300 dark:border-blue-500/30'
                            : 'bg-slate-100 dark:bg-white/[0.07] text-gray-600 dark:text-gray-300 border-slate-200 dark:border-white/10 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30 dark:hover:text-blue-200'
                      } ${isPendingContinue ? 'ring-1 ring-blue-500' : ''}`}
                    >
                      <button
                        onClick={() => onPlaySentence(sentence.text, index)}
                        title={`单句朗读：${sentence.text}`}
                        className="h-full min-w-0 flex-1 px-3 text-left text-[12px] leading-none font-medium truncate whitespace-nowrap flex items-center"
                      >
                        {index + 1}. {sentence.text}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
