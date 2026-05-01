import type React from 'react';
import type { AnalysisItem, AnalysisResult } from '../types';

interface AnalysisPanelProps {
  analysisResult: AnalysisResult;
  isCollapsed: boolean;
  addedItems: Set<string>;
  onToggleCollapsed: () => void;
  onExport: () => void;
  onAddItem: (item: Pick<AnalysisItem, 'text' | 'cn'>) => void;
  onPlaySentence: (text: string) => void;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  analysisResult,
  isCollapsed,
  addedItems,
  onToggleCollapsed,
  onExport,
  onAddItem,
  onPlaySentence
}) => {
  return (
    <div className="mt-8 mb-8 animate-in slide-in-from-bottom-5 duration-500">
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-3xl border border-indigo-100 dark:border-indigo-500/20 shadow-sm overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between border-b border-indigo-100/50 dark:border-indigo-500/10 cursor-pointer" onClick={onToggleCollapsed}>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C12 7 17 12 22 12C17 12 12 17 12 22C12 17 7 12 2 12C7 12 12 7 12 2Z" fill="currentColor" /></svg>
            <h3 className="font-bold text-gray-900 dark:text-white">AI 智能分析</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={(event) => { event.stopPropagation(); onExport(); }}
              className="text-xs px-3 py-1 bg-white dark:bg-gray-800 border border-indigo-100 dark:border-indigo-500/20 rounded-full text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              一键打包
            </button>
            <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-transform duration-300" style={{ transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
          </div>
        </div>

        {!isCollapsed && (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">常用词块 (Collocations)</h4>
              <div className="space-y-3">
                {analysisResult.collocations.map((item, idx) => (
                  <AnalysisItemRow
                    key={idx}
                    item={item}
                    isAdded={addedItems.has(item.text)}
                    onAdd={onAddItem}
                  />
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">核心词汇 (Vocabulary)</h4>
              <div className="space-y-3">
                {analysisResult.vocabulary.map((item, idx) => (
                  <AnalysisItemRow
                    key={idx}
                    item={item}
                    isAdded={addedItems.has(item.text)}
                    showPronunciation
                    onAdd={onAddItem}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {!isCollapsed && analysisResult.sentences && analysisResult.sentences.length > 0 && (
          <div className="px-6 pb-6 pt-0 border-t border-indigo-100/50 dark:border-indigo-500/10">
            <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider my-4 flex items-center gap-2">
              🎙️ 重点跟读 (Key Sentences)
            </h4>
            <div className="space-y-4">
              {analysisResult.sentences.map((sent, idx) => (
                <div key={idx} className="bg-white/80 dark:bg-white/5 p-4 rounded-xl border border-indigo-50 dark:border-white/5">
                  <div className="flex gap-3">
                    <button
                      onClick={() => onPlaySentence(sent.text)}
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
  );
};

interface AnalysisItemRowProps {
  item: AnalysisItem;
  isAdded: boolean;
  showPronunciation?: boolean;
  onAdd: (item: Pick<AnalysisItem, 'text' | 'cn'>) => void;
}

const AnalysisItemRow: React.FC<AnalysisItemRowProps> = ({
  item,
  isAdded,
  showPronunciation = false,
  onAdd
}) => (
  <div className="flex items-start justify-between group bg-white/50 dark:bg-white/5 p-3 rounded-xl hover:bg-white dark:hover:bg-white/10 transition-colors">
    <div>
      <div className={showPronunciation ? 'font-bold text-gray-900 dark:text-white' : 'font-semibold text-gray-800 dark:text-gray-200'}>{item.text}</div>
      {showPronunciation && (item.reading || item.ipa) && (
        <div className="text-xs text-indigo-500 dark:text-indigo-400 font-mono mb-0.5">
          {item.reading || item.ipa}
        </div>
      )}
      <div className="text-sm text-gray-500 dark:text-gray-400">{item.cn}</div>
      {showPronunciation && item.ru && (
        <div className="text-xs text-gray-400 dark:text-gray-500 italic mt-0.5">🇷🇺 {item.ru}</div>
      )}
    </div>
    <button
      onClick={() => onAdd(item)}
      disabled={isAdded}
      className={`p-1.5 rounded-lg transition-colors ${
        isAdded
          ? 'text-green-500'
          : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
      }`}
    >
      {isAdded ? (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
      )}
    </button>
  </div>
);
