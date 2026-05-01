import { useCallback, useState } from 'react';
import type { AnalysisItem, AnalysisResult, AppSettings, HistoryEntry, WordEntry } from '../types';
import type { SiliconFlowService } from '../services/siliconFlow';
import { useLocalStorage } from './useLocalStorage';
import { analysisResultToAnkiCsv } from '../utils/ankiExport';

export interface TranslationResult {
  text: string;
  type: 'translation' | 'reply';
}

interface UseTextAnalysisOptions {
  inputText: string;
  settings: AppSettings;
  sfService: SiliconFlowService;
  onAddToHistory: (entry: HistoryEntry) => void;
  onAddToVocab: (entry: WordEntry) => void;
}

export const createTextHistoryEntry = (
  original: string,
  translation: string,
  type: HistoryEntry['type'],
  timestamp = Date.now()
): HistoryEntry => ({
  id: timestamp.toString(),
  original,
  translation,
  type,
  timestamp
});

export const createAnalysisVocabEntry = (
  item: Pick<AnalysisItem, 'text' | 'cn'>,
  timestamp = Date.now()
): WordEntry => ({
  id: timestamp.toString(),
  word: item.text,
  meaningCn: item.cn,
  meaningRu: '',
  timestamp
});

const downloadTextFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const useTextAnalysis = ({
  inputText,
  settings,
  sfService,
  onAddToHistory,
  onAddToVocab
}: UseTextAnalysisOptions) => {
  const [translationResult, setTranslationResult] = useLocalStorage<TranslationResult | null>('reader_translation_result', null);
  const [analysisResult, setAnalysisResult] = useLocalStorage<AnalysisResult | null>('reader_analysis_result', null);
  const [isAnalysisCollapsed, setIsAnalysisCollapsed] = useLocalStorage('reader_analysis_collapsed', false);
  const [addedAnalysisItems, setAddedAnalysisItems] = useState<Set<string>>(new Set());
  const [isTranslating, setIsTranslating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleTranslate = useCallback(async () => {
    if (!inputText.trim()) { alert('请先输入内容'); return; }
    if (!settings.apiKey) { alert('请配置 API Key'); return; }

    setIsTranslating(true);
    setTranslationResult(null);

    try {
      const result = await sfService.translateArticle(inputText, settings.llmModel);
      onAddToHistory(createTextHistoryEntry(inputText, result, 'translation'));
      setTranslationResult({ text: result, type: 'translation' });
    } catch {
      alert('请求失败，请检查网络或 API Key');
    } finally {
      setIsTranslating(false);
    }
  }, [inputText, onAddToHistory, setTranslationResult, settings.apiKey, settings.llmModel, sfService]);

  const handleRussianReply = useCallback(async () => {
    if (!inputText.trim()) { alert('请先输入内容'); return; }
    if (!settings.apiKey) { alert('请配置 API Key'); return; }

    setIsTranslating(true);
    setTranslationResult(null);

    try {
      const result = await sfService.generateContextAwareReply(inputText, settings.llmModel);
      onAddToHistory(createTextHistoryEntry(inputText, result, 'reply'));
      setTranslationResult({ text: result, type: 'reply' });
    } catch {
      alert('请求失败，请检查网络或 API Key');
    } finally {
      setIsTranslating(false);
    }
  }, [inputText, onAddToHistory, setTranslationResult, settings.apiKey, settings.llmModel, sfService]);

  const handleAnalyze = useCallback(async () => {
    if (!inputText.trim()) { alert('请先输入内容'); return; }
    if (!settings.apiKey) { alert('请配置 API Key'); return; }

    setIsAnalyzing(true);
    setAnalysisResult(null);
    setAddedAnalysisItems(new Set());
    setIsAnalysisCollapsed(false);

    try {
      const result = await sfService.analyzeText(inputText, settings.llmModel);
      setAnalysisResult(result);
    } catch {
      alert('分析失败');
    } finally {
      setIsAnalyzing(false);
    }
  }, [
    inputText,
    setAnalysisResult,
    setIsAnalysisCollapsed,
    settings.apiKey,
    settings.llmModel,
    sfService
  ]);

  const handleExportAnalysis = useCallback(() => {
    if (!analysisResult) return;
    const csvContent = analysisResultToAnkiCsv(analysisResult);
    downloadTextFile(csvContent, `analysis_export_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
  }, [analysisResult]);

  const addAnalysisItemToVocab = useCallback((item: Pick<AnalysisItem, 'text' | 'cn'>) => {
    onAddToVocab(createAnalysisVocabEntry(item));
    setAddedAnalysisItems(prev => new Set(prev).add(item.text));
  }, [onAddToVocab]);

  return {
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
  };
};
