
import React, { useState } from 'react';
import { WordEntry } from '../types';

interface Props {
  vocab: WordEntry[];
  onRemove: (ids: string[]) => void;
}

export const VocabularyView: React.FC<Props> = ({ vocab, onRemove }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGuide, setShowGuide] = useState(false);

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
      // 1. Clean sentence quotes
      const cleanSentence = item.contextSentence 
        ? item.contextSentence.trim().replace(/^['"“]+|['"”]+$/g, '') 
        : '';

      // 2. Use Inline Styles to prevent CSV splitting issues (caused by semicolons in <style> blocks)
      // 3. Use 'opacity' for colors to support Anki Dark Mode automatically (Text remains native color)
      
      const frontHtml = `
        <div style="padding: 20px; text-align: center; font-family: system-ui, -apple-system, sans-serif;">
            <div style="font-size: 32px; font-weight: bold; margin-bottom: 10px;">${item.word}</div>
            ${item.ipa ? `<div style="font-family: monospace; font-size: 16px; opacity: 0.6; margin-bottom: 20px;">/${item.ipa}/</div>` : ''}
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

      // CSV Escaping
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

  return (
    <div className="p-4 md:p-6 h-full flex flex-col max-w-full relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">生词本</h2>
                <p className="text-gray-500 text-sm mt-1">共 {vocab.length} 个单词</p>
            </div>
            
            <div className="flex flex-wrap gap-3 w-full md:w-auto">
                <button 
                    onClick={handleDelete}
                    disabled={selectedIds.size === 0}
                    className="flex-1 md:flex-none px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-full text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-red-100"
                >
                    删除 ({selectedIds.size})
                </button>
                <button 
                    onClick={handleExportAnki}
                    disabled={selectedIds.size === 0}
                    className="flex-1 md:flex-none px-4 py-2 text-white bg-black hover:bg-gray-800 rounded-full text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    导出到 Anki
                </button>
            </div>
        </div>

        {showGuide && (
            <div className="mb-6 bg-blue-50 border border-blue-100 p-4 rounded-xl text-sm text-blue-900 relative">
                <button onClick={() => setShowGuide(false)} className="absolute top-2 right-2 text-blue-400 hover:text-blue-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <h4 className="font-bold mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Anki 导入指南
                </h4>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                    <li>打开 Anki 电脑版，点击 <strong>文件 (File) -&gt; 导入 (Import)</strong></li>
                    <li>选择下载的 <code>{`polyglot_anki_...csv`}</code> 文件</li>
                    <li>在导入窗口设置：
                        <ul className="list-disc list-inside ml-4 mt-1 text-blue-800/80">
                            <li><strong>笔记类型</strong>: 选择 "基础 (Basic)"</li>
                            <li><strong>字段分隔符</strong>: 确保选择 <strong>"逗号 (Comma)"</strong></li>
                            <li><strong>字段匹配</strong>: 
                                <span className="mx-1 bg-white px-1 rounded border border-blue-200">字段 1</span> 对应 
                                <span className="mx-1 bg-white px-1 rounded border border-blue-200">正面</span>，
                                <span className="mx-1 bg-white px-1 rounded border border-blue-200">字段 2</span> 对应 
                                <span className="mx-1 bg-white px-1 rounded border border-blue-200">背面</span>
                            </li>
                            <li><strong>关键</strong>: 勾选 "允许在字段中使用 HTML"</li>
                        </ul>
                    </li>
                </ol>
            </div>
        )}

        <div className="bg-white rounded-3xl shadow-[0_2px_15px_rgb(0,0,0,0.02)] border border-gray-100 flex-1 overflow-hidden flex flex-col">
             {/* Header - Hidden on mobile for space */}
             <div className="hidden md:flex items-center p-4 border-b border-gray-100 bg-gray-50/50 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <div className="w-12 text-center">
                    <input 
                        type="checkbox" 
                        onChange={toggleAll}
                        checked={vocab.length > 0 && selectedIds.size === vocab.length}
                        className="rounded-md border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4" 
                    />
                </div>
                <div className="w-1/4">单词 / 音标</div>
                <div className="w-1/4">中文释义</div>
                <div className="w-1/4">俄语释义</div>
                <div className="flex-1">例句</div>
             </div>

            <div className="overflow-y-auto flex-1">
                {vocab.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                        <p>暂无生词</p>
                        <p className="text-sm mt-1">在阅读时选中文本即可查词并自动保存</p>
                    </div>
                ) : (
                    <div className="block md:table w-full text-left">
                        {/* Mobile: Card Layout */}
                        <div className="md:hidden divide-y divide-gray-100">
                            {vocab.map((entry) => (
                                <div key={entry.id} className="p-4 flex gap-4 items-start active:bg-gray-50">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedIds.has(entry.id)}
                                        onChange={() => toggleSelection(entry.id)}
                                        className="mt-1.5 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5" 
                                    />
                                    <div className="flex-1 min-w-0 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-gray-900 text-lg truncate">{entry.word}</span>
                                            {entry.ipa && <span className="text-xs text-gray-500 font-mono bg-gray-100 px-1.5 rounded">{entry.ipa}</span>}
                                        </div>
                                        <div className="text-sm text-gray-700 leading-snug">
                                            <span className="text-gray-400 text-xs mr-1">中</span>{entry.meaningCn}
                                        </div>
                                        <div className="text-sm text-gray-700 leading-snug">
                                            <span className="text-gray-400 text-xs mr-1">俄</span>{entry.meaningRu}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop: Table Layout */}
                        <table className="hidden md:table w-full text-left border-collapse">
                            <tbody className="divide-y divide-gray-50">
                                {vocab.map((entry) => (
                                    <tr key={entry.id} className="hover:bg-blue-50/30 transition-colors group">
                                        <td className="p-4 text-center w-12">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedIds.has(entry.id)}
                                                onChange={() => toggleSelection(entry.id)}
                                                className="rounded-md border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" 
                                            />
                                        </td>
                                        <td className="p-4 w-1/4 align-top">
                                            <div className="font-semibold text-gray-900 text-lg">{entry.word}</div>
                                            {entry.ipa && <div className="text-xs text-gray-500 font-mono mt-0.5 bg-gray-100 inline-block px-1.5 rounded">{entry.ipa}</div>}
                                        </td>
                                        <td className="p-4 w-1/4 align-top text-gray-700 leading-relaxed">{entry.meaningCn}</td>
                                        <td className="p-4 w-1/4 align-top text-gray-700 leading-relaxed">{entry.meaningRu}</td>
                                        <td className="p-4 align-top text-gray-500 text-sm italic leading-relaxed">
                                            {entry.contextSentence && `"${entry.contextSentence.replace(/^['"“]+|['"”]+$/g, '')}"`}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};
