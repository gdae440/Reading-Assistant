import React, { useState, useMemo } from 'react';
import { WordEntry, HistoryEntry } from '../types';

interface Props {
  vocab: WordEntry[];
  history: HistoryEntry[];
  onRemove: (ids: string[]) => void;
}

type LangCategory = 'Japanese' | 'Russian' | 'Chinese' | 'English/Other';

export const VocabularyView: React.FC<Props> = ({ vocab, history, onRemove }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGuide, setShowGuide] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Group vocabulary by language
  const groupedVocab = useMemo(() => {
    const groups: Record<LangCategory, WordEntry[]> = {
        'Japanese': [],
        'Russian': [],
        'Chinese': [],
        'English/Other': []
    };

    vocab.forEach(word => {
        if (/[\u3040-\u30ff\u3400-\u4dbf]/.test(word.word)) {
            groups['Japanese'].push(word);
        } else if (/[а-яА-ЯЁё]/.test(word.word)) {
            groups['Russian'].push(word);
        } else if (/[\u4e00-\u9fa5]/.test(word.word)) {
            groups['Chinese'].push(word);
        } else {
            groups['English/Other'].push(word);
        }
    });
    return groups;
  }, [vocab]);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleAll = () => {
    if (selectedIds.size === vocab.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(vocab.map(v => v.id)));
    }
  };

  const handleDelete = () => {
    const confirmed = window.confirm(`确定要删除选中的 ${selectedIds.size} 个单词吗？`);
    if (confirmed) {
        const idsToRemove = Array.from(selectedIds);
        onRemove(idsToRemove);
        setSelectedIds(new Set());
    }
  };

  const handleExportAnki = () => {
    const selectedEntries = vocab.filter(v => selectedIds.has(v.id));
    if (selectedEntries.length === 0) return;

    let csvContent = "";

    selectedEntries.forEach(item => {
      const cleanSentence = item.contextSentence 
        ? item.contextSentence.trim().replace(/^['"“]+|['"”]+$/g, '') 
        : '';

      const frontHtml = `
        <div style="padding: 20px; text-align: center; font-family: system-ui, -apple-system, sans-serif;">
            <div style="font-size: 32px; font-weight: bold; margin-bottom: 10px;">${item.word}</div>
            ${item.ipa ? `<div style="font-family: monospace; font-size: 16px; opacity: 0.6; margin-bottom: 20px;">/${item.ipa}/</div>` : ''}
            ${item.reading ? `<div style="font-size: 16px; opacity: 0.6; margin-bottom: 20px;">(${item.reading})</div>` : ''}
            ${cleanSentence ? `
            <div style="font-size: 18px; line-height: 1.5; font-style: italic; opacity: 0.85; margin-top: 20px; border-top: 1px solid rgba(127,127,127,0.2); padding-top: 15px;">
                "${cleanSentence}"
            </div>` : ''}
        </div>
      `.replace(/[\r\n]+/g, ' ').trim();

      const backHtml = `
        <div style="padding: 20px; text-align: left; font-family: system-ui, -apple-system, sans-serif;">
            ${item.meaningCn ? `
            <div style="margin-bottom: 20px;">
                <div style="font-size: 12px; font-weight: bold; text-transform: uppercase; opacity: 0.5; margin-bottom: 4px;">中文释义</div>
                <div style="font-size: 18px; line-height: 1.4;">${item.meaningCn}</div>
            </div>` : ''}
            
            ${item.meaningRu ? `
            <div style="margin-bottom: 20px;">
                <div style="font-size: 12px; font-weight: bold; text-transform: uppercase; opacity: 0.5; margin-bottom: 4px;">俄语释义</div>
                <div style="font-size: 18px; line-height: 1.4;">${item.meaningRu}</div>
            </div>` : ''}
        </div>
      `.replace(/[\r\n]+/g, ' ').trim();

      const escapeCsv = (str: string) => `"${str.replace(/"/g, '""')}"`;
      csvContent += `${escapeCsv(frontHtml)},${escapeCsv(backHtml)}\n`;
    });

    const dateStr = new Date().toISOString().slice(0,10);
    const filename = `polyglot_anki_${dateStr}_${selectedEntries.length}.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setShowGuide(true);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
  };

  const renderVocabGroup = (title: string, items: WordEntry[], flag: string) => {
    if (items.length === 0) return null;

    return (
        <div key={title} className="mb-8 last:mb-0 animate-in fade-in duration-300">
            <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-xl">{flag}</span>
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</h3>
                <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">{items.length}</span>
            </div>
            
            <div className="bg-white dark:bg-[#1c1c1e] rounded-3xl shadow-[0_2px_15px_rgb(0,0,0,0.02)] border border-gray-100 dark:border-white/10 overflow-hidden transition-colors">
                <div className="block md:table w-full text-left">
                     {/* Mobile: Card Layout */}
                     <div className="md:hidden divide-y divide-gray-100 dark:divide-white/5">
                        {items.map((entry) => (
                            <div key={entry.id} className="p-4 flex gap-4 items-start active:bg-gray-50 dark:active:bg-white/5 transition-colors">
                                <input 
                                    type="checkbox" 
                                    checked={selectedIds.has(entry.id)}
                                    onChange={() => toggleSelection(entry.id)}
                                    className="mt-1.5 rounded-md border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 w-5 h-5" 
                                />
                                <div className="flex-1 min-w-0 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-900 dark:text-white text-lg truncate">{entry.word}</span>
                                        {/* Show Reading or IPA */}
                                        {(entry.ipa || entry.reading) && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-1.5 rounded">
                                                {entry.reading || entry.ipa}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
                                        <span className="text-gray-400 dark:text-gray-600 text-xs mr-1">中</span>{entry.meaningCn}
                                    </div>
                                    {entry.meaningRu && (
                                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
                                        <span className="text-gray-400 dark:text-gray-600 text-xs mr-1">俄</span>{entry.meaningRu}
                                    </div>
                                    )}
                                </div>
                            </div>
                        ))}
                     </div>

                    {/* Desktop: Table Layout */}
                    <table className="hidden md:table w-full text-left border-collapse">
                        <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                            {items.map((entry) => (
                                <tr key={entry.id} className="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors group">
                                    <td className="p-4 text-center w-12">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.has(entry.id)}
                                            onChange={() => toggleSelection(entry.id)}
                                            className="rounded-md border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" 
                                        />
                                    </td>
                                    <td className="p-4 w-1/4 align-top">
                                        <div className="font-semibold text-gray-900 dark:text-white text-lg">{entry.word}</div>
                                        {(entry.ipa || entry.reading) && (
                                            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5 bg-gray-100 dark:bg-gray-800 inline-block px-1.5 rounded">
                                                {entry.reading || entry.ipa}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4 w-1/4 align-top text-gray-700 dark:text-gray-300 leading-relaxed">{entry.meaningCn}</td>
                                    <td className="p-4 w-1/4 align-top text-gray-700 dark:text-gray-300 leading-relaxed">{entry.meaningRu}</td>
                                    <td className="p-4 align-top text-gray-500 dark:text-gray-400 text-sm italic leading-relaxed">
                                        {entry.contextSentence && `"${entry.contextSentence.replace(/^['"“]+|['"”]+$/g, '')}"`}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="p-4 md:p-6 h-full flex flex-col max-w-full relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            {/* Left: Title & Count */}
            <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">生词本</h2>
                <div className="flex items-center gap-2 mt-1">
                    <p className="text-gray-500 dark:text-gray-400 text-sm">共 {vocab.length} 个单词</p>
                    {vocab.length > 0 && (
                        <div className="flex gap-1 ml-2 text-xs opacity-60">
                            {groupedVocab['Japanese'].length > 0 && <span title="日语">🇯🇵 {groupedVocab['Japanese'].length}</span>}
                            {groupedVocab['Russian'].length > 0 && <span title="俄语">🇷🇺 {groupedVocab['Russian'].length}</span>}
                            {groupedVocab['Chinese'].length > 0 && <span title="中文">🇨🇳 {groupedVocab['Chinese'].length}</span>}
                            {groupedVocab['English/Other'].length > 0 && <span title="英语/其他">🇬🇧 {groupedVocab['English/Other'].length}</span>}
                        </div>
                    )}
                </div>
            </div>
            
            {/* Right: Actions Group */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <button 
                    onClick={handleDelete}
                    disabled={selectedIds.size === 0}
                    className="flex-1 md:flex-none px-4 py-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-full text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-red-100 dark:border-red-900/20 whitespace-nowrap"
                >
                    删除 ({selectedIds.size})
                </button>
                <button 
                    onClick={handleExportAnki}
                    disabled={selectedIds.size === 0}
                    className="flex-1 md:flex-none px-4 py-2 text-white bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 rounded-full text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm whitespace-nowrap"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    导出到 Anki
                </button>
                <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1 hidden md:block"></div>
                <button 
                    onClick={() => setShowHistory(true)}
                    className="w-9 h-9 flex items-center justify-center bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm border border-gray-100 dark:border-white/10"
                    title="查看历史记录"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </button>
            </div>
        </div>

        {/* Action Bar / Select All Row */}
        {vocab.length > 0 && (
             <div className="flex items-center gap-2 mb-4 px-1">
                 <input 
                     type="checkbox" 
                     id="selectAll"
                     onChange={toggleAll}
                     checked={selectedIds.size === vocab.length}
                     className="rounded-md border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" 
                 />
                 <label htmlFor="selectAll" className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                     全选所有单词
                 </label>
             </div>
        )}

        <div className="flex-1 overflow-y-auto pb-20 scrollbar-hide">
            {vocab.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-600">
                    <svg className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                    <p>暂无生词</p>
                </div>
            ) : (
                <>
                    {renderVocabGroup('日语 (Japanese)', groupedVocab['Japanese'], '🇯🇵')}
                    {renderVocabGroup('俄语 (Russian)', groupedVocab['Russian'], '🇷🇺')}
                    {renderVocabGroup('中文 (Chinese)', groupedVocab['Chinese'], '🇨🇳')}
                    {renderVocabGroup('英语 / 其他 (English/Other)', groupedVocab['English/Other'], '🇬🇧')}
                </>
            )}
        </div>

        {/* ... (Guide and History Modal logic preserved) ... */}
        {showGuide && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 dark:bg-black/70 backdrop-blur-sm" onClick={() => setShowGuide(false)}>
                <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-[#1c1c1e] p-6 rounded-2xl max-w-md w-full shadow-2xl border border-white/10 relative">
                     <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                    <h4 className="font-bold text-lg mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Anki 导入指南
                    </h4>
                    <ol className="list-decimal list-inside space-y-3 text-sm text-gray-600 dark:text-gray-300">
                        <li>打开 Anki 电脑版，点击 <strong>文件 (File) -&gt; 导入 (Import)</strong></li>
                        <li>选择刚刚下载的 CSV 文件</li>
                        <li className="p-3 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/5">
                            <div className="font-semibold mb-1 text-gray-800 dark:text-white">关键设置：</div>
                            <ul className="list-disc list-inside ml-2 space-y-1 opacity-90">
                                <li>笔记类型: <strong>基础 (Basic)</strong></li>
                                <li>字段分隔符: <strong>逗号 (Comma)</strong></li>
                                <li>勾选: <strong>允许在字段中使用 HTML</strong></li>
                            </ul>
                        </li>
                    </ol>
                    <button onClick={() => setShowGuide(false)} className="w-full mt-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors">
                        我知道了
                    </button>
                </div>
            </div>
        )}

        {/* History Modal */}
        {showHistory && (
             <div 
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={() => setShowHistory(false)}
             >
                 <div 
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white dark:bg-[#1c1c1e] w-full max-w-lg rounded-3xl shadow-2xl border border-white/20 dark:border-white/10 flex flex-col max-h-[80vh] overflow-hidden transform scale-100 transition-all animate-in zoom-in-95 duration-200"
                 >
                     <div className="p-4 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-gray-50/50 dark:bg-white/5">
                         <h3 className="font-bold text-lg text-gray-900 dark:text-white">翻译/回复历史</h3>
                         <button onClick={() => setShowHistory(false)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                         </button>
                     </div>
                     
                     <div className="overflow-y-auto flex-1 p-0 scrollbar-hide">
                         {history.length === 0 ? (
                             <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                                 <svg className="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                 <p>暂无历史记录</p>
                             </div>
                         ) : (
                             <div className="divide-y divide-gray-50 dark:divide-white/5">
                                 {history.map((item) => (
                                     <div key={item.id} className="group">
                                         <div 
                                            onClick={() => setExpandedHistoryId(expandedHistoryId === item.id ? null : item.id)}
                                            className={`p-4 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors ${expandedHistoryId === item.id ? 'bg-gray-50 dark:bg-white/5' : ''}`}
                                         >
                                             <div className="flex justify-between items-start mb-1.5">
                                                 <div className="flex items-center gap-2">
                                                     <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${
                                                         item.type === 'reply' 
                                                         ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' 
                                                         : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                                     }`}>
                                                         {item.type === 'reply' ? '回复' : '翻译'}
                                                     </span>
                                                     <span className="text-xs text-gray-400 font-mono">{formatDate(item.timestamp)}</span>
                                                 </div>
                                                 <div className={`text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-transform duration-200 ${expandedHistoryId === item.id ? 'rotate-180' : ''}`}>
                                                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                                 </div>
                                             </div>
                                             <div className={`text-sm text-gray-800 dark:text-gray-200 leading-relaxed ${expandedHistoryId === item.id ? '' : 'line-clamp-2'}`}>
                                                 {item.original}
                                             </div>
                                         </div>
                                         
                                         {/* Expanded Details */}
                                         {expandedHistoryId === item.id && (
                                             <div className="px-4 pb-4 bg-gray-50 dark:bg-white/5 text-sm space-y-4 animate-in fade-in duration-200">
                                                 <div className="pt-2 border-t border-gray-200/50 dark:border-white/10">
                                                     <div className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1.5">结果</div>
                                                     <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed select-text bg-white dark:bg-black/20 p-3 rounded-xl border border-gray-100 dark:border-white/5">
                                                        {item.translation}
                                                     </div>
                                                 </div>
                                                 <div className="flex justify-end">
                                                     <button 
                                                         onClick={(e) => {
                                                             e.stopPropagation();
                                                             navigator.clipboard.writeText(`原文:\n${item.original}\n\n译文:\n${item.translation}`);
                                                             alert("已复制完整内容");
                                                         }}
                                                         className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors shadow-sm"
                                                     >
                                                         <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                                         复制
                                                     </button>
                                                 </div>
                                             </div>
                                         )}
                                     </div>
                                 ))}
                             </div>
                         )}
                     </div>
                 </div>
             </div>
        )}
    </div>
  );
};