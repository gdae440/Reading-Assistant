
import React from 'react';
import { LookupResult } from '../types';

interface Props {
  data: LookupResult | null;
  isLoading: boolean;
  onClose: () => void;
  position: { x: number, y: number } | null;
}

export const WordDetailModal: React.FC<Props> = ({ data, isLoading, onClose, position }) => {
  if (!position) return null;

  return (
    <div 
      className="fixed z-50 glass-panel bg-white/90 rounded-2xl shadow-2xl p-5 w-80 transition-all duration-300 ease-out origin-top-left animate-in fade-in zoom-in-95"
      style={{ 
        left: position.x, 
        top: position.y
      }}
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className="font-bold text-xl text-gray-900 tracking-tight">
          {isLoading ? '查询中...' : data?.word}
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 bg-gray-100 rounded-full">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      ) : data ? (
        <div className="space-y-3">
          {data.ipa && (
            <div className="inline-block px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-sm font-mono mb-1">
              {data.ipa}
            </div>
          )}
          
          <div className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="font-semibold text-gray-400 min-w-[24px]">中</span>
              <span className="text-gray-800 leading-snug">{data.cn}</span>
            </div>
            
            {data.ru && (
              <div className="flex gap-2">
                <span className="font-semibold text-gray-400 min-w-[24px]">俄</span>
                <span className="text-gray-800 leading-snug">{data.ru}</span>
              </div>
            )}
          </div>

          {data.example && (
            <div className="mt-3 p-3 bg-blue-50/50 rounded-xl text-sm text-blue-900 border border-blue-100/50">
              "{data.example}"
            </div>
          )}

          <div className="flex items-center gap-1.5 mt-2 text-xs text-green-600 font-medium pt-2 border-t border-gray-100">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
            已自动保存到生词本
          </div>
        </div>
      ) : (
        <div className="text-red-500 text-sm">查询失败，请重试。</div>
      )}
    </div>
  );
};
