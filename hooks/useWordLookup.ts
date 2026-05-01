import { useCallback, useMemo, useState } from 'react';
import type React from 'react';
import type { LookupResult, WordEntry } from '../types';
import type { SiliconFlowService } from '../services/siliconFlow';
import { normalizeWordKey } from '../utils/vocabReview';

interface ModalPosition {
  x: number;
  y: number;
}

interface RectLike {
  left: number;
  bottom: number;
  top: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

interface UseWordLookupOptions {
  vocab: WordEntry[];
  apiKey: string;
  llmModel: string;
  detectedLang: string;
  sfService: SiliconFlowService;
  onAddToVocab: (entry: WordEntry) => void;
}

const MODAL_WIDTH = 320;
const MODAL_HEIGHT = 300;

export const cleanLookupWord = (text: string) =>
  text.replace(/^[^\w\u0400-\u04FF\u4e00-\u9fa5]+|[^\w\u0400-\u04FF\u4e00-\u9fa5]+$/g, '');

export const isLookupWordValid = (word: string) => Boolean(word) && word.length <= 20;

export const calculateLookupModalPosition = (
  rect: RectLike,
  viewport: ViewportSize,
  modalWidth = MODAL_WIDTH,
  modalHeight = MODAL_HEIGHT
): ModalPosition => {
  let x = rect.left;
  let y = rect.bottom + 10;

  if (x + modalWidth > viewport.width) {
    x = viewport.width - modalWidth - 16;
  }

  if (y + modalHeight > viewport.height) {
    y = rect.top - modalHeight - 10;
  }

  if (x < 10) x = 10;
  if (y < 10) y = rect.bottom + 10;

  return { x, y };
};

export const createLookupVocabEntry = (result: LookupResult, timestamp = Date.now()): WordEntry => ({
  id: timestamp.toString(),
  word: result.word,
  reading: result.reading,
  ipa: result.ipa,
  meaningCn: result.cn,
  meaningRu: result.ru,
  timestamp,
  contextSentence: ''
});

export const useWordLookup = ({
  vocab,
  apiKey,
  llmModel,
  detectedLang,
  sfService,
  onAddToVocab
}: UseWordLookupOptions) => {
  const [lookupData, setLookupData] = useState<LookupResult | null>(null);
  const [modalPosition, setModalPosition] = useState<ModalPosition | null>(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);

  const savedWordSet = useMemo(() => {
    const keys = vocab.map(entry => normalizeWordKey(entry.word)).filter(Boolean);
    return new Set(keys);
  }, [vocab]);

  const isSavedWord = useCallback((word: string) => {
    return savedWordSet.has(normalizeWordKey(word));
  }, [savedWordSet]);

  const closeLookup = useCallback(() => {
    setModalPosition(null);
  }, []);

  const performLookup = useCallback(async (text: string, position: ModalPosition) => {
    if (!apiKey) {
      alert('请先配置 API Key');
      return;
    }

    const cleanWord = cleanLookupWord(text);
    if (!isLookupWordValid(cleanWord)) return;

    setModalPosition(position);
    setLookupData({ word: cleanWord, ipa: '', cn: '查询中...', ru: '' });
    setIsLookupLoading(true);

    try {
      const result = await sfService.lookupWordFast(cleanWord, llmModel, detectedLang);
      setLookupData(result);
      onAddToVocab(createLookupVocabEntry(result));
    } catch {
      setLookupData(null);
    } finally {
      setIsLookupLoading(false);
    }
  }, [apiKey, detectedLang, llmModel, onAddToVocab, sfService]);

  const handleWordClick = useCallback(async (e: React.MouseEvent<HTMLSpanElement>, word: string) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const position = calculateLookupModalPosition(rect, {
      width: window.innerWidth,
      height: window.innerHeight
    });

    await performLookup(word, position);
  }, [performLookup]);

  return {
    lookupData,
    modalPosition,
    isLookupLoading,
    isSavedWord,
    closeLookup,
    handleWordClick
  };
};
