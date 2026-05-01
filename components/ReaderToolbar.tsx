import type React from 'react';

interface ReaderToolbarProps {
  isReaderMode: boolean;
  isBlindMode: boolean;
  isAnalyzing: boolean;
  isTranslating: boolean;
  ocrLoading: boolean;
  ocrStatus: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onToggleReaderMode: () => void;
  onToggleBlindMode: () => void;
  onAnalyze: () => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onTranslate: () => void;
  onRussianReply: () => void;
}

export const ReaderToolbar: React.FC<ReaderToolbarProps> = ({
  isReaderMode,
  isBlindMode,
  isAnalyzing,
  isTranslating,
  ocrLoading,
  ocrStatus,
  fileInputRef,
  onToggleReaderMode,
  onToggleBlindMode,
  onAnalyze,
  onFileUpload,
  onTranslate,
  onRussianReply
}) => {
  return (
    <div className="flex-none p-3 md:p-6 pb-2">
      <div className="flex items-center justify-between bg-white dark:bg-[#1c1c1e] p-2 md:p-2 rounded-xl shadow-sm border border-gray-100 dark:border-white/10 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-1.5 md:gap-2">
          <button
            onClick={onToggleReaderMode}
            className={`px-3.5 py-2 md:px-4 md:py-2 rounded-lg text-sm md:text-sm font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${isReaderMode ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
          >
            {isReaderMode ? '编辑' : '查词'}
          </button>

          <button
            onClick={onToggleBlindMode}
            className={`p-2 md:p-2 rounded-lg flex-none transition-colors flex items-center gap-1.5 ${
              isBlindMode
                ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-black'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            title={isBlindMode ? '关闭盲听' : '开启盲听'}
          >
            {isBlindMode ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
            )}
            <span className="text-xs font-bold hidden md:inline">盲听</span>
          </button>

          <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className={`p-2 md:p-2 rounded-lg flex-none transition-colors flex items-center gap-1.5 ${
              isAnalyzing ? 'bg-gray-100 dark:bg-gray-800 text-gray-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            title="AI 智能分析"
          >
            {isAnalyzing ? (
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            ) : (
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
            )}
            <span className="text-xs font-bold hidden md:inline bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500">AI</span>
          </button>

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
              onChange={onFileUpload}
            />
          </div>
          {ocrLoading && <span className="text-xs text-blue-500 animate-pulse hidden md:inline ml-1">{ocrStatus}</span>}
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          <button
            onClick={onTranslate}
            disabled={isTranslating}
            className="h-9 min-w-[72px] px-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-bold text-xs transition-all whitespace-nowrap inline-flex items-center justify-center gap-1"
          >
            {isTranslating ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            ) : (
              '翻译'
            )}
          </button>
          <button
            onClick={onRussianReply}
            disabled={isTranslating}
            className="h-9 min-w-[72px] px-3 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/40 font-bold text-xs transition-all whitespace-nowrap inline-flex items-center justify-center gap-1"
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
  );
};
