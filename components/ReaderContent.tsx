import type React from 'react';
import type { AnalysisSentence } from '../types';
import { splitTextIntoSentences } from '../utils/textSegmentation';

interface ReaderContentProps {
  inputText: string;
  sentences: AnalysisSentence[];
  currentSentenceIndex?: number | null;
  currentSentenceText?: string | null;
  isSavedWord: (word: string) => boolean;
  onWordClick: (event: React.MouseEvent<HTMLSpanElement>, word: string) => void;
}

export const ReaderContent: React.FC<ReaderContentProps> = ({
  inputText,
  sentences,
  currentSentenceIndex,
  currentSentenceText,
  isSavedWord,
  onWordClick
}) => {
  if (!inputText) {
    return <div className="text-gray-400 mt-10 text-center">在此粘贴文章，开始跟读...</div>;
  }

  const normalizedInput = inputText.replace(/\r\n/g, '\n');
  let sentenceOffset = 0;

  return normalizedInput.split(/\n+/).map((para, pIdx) => {
    const sentenceRanges = getParagraphSentenceRanges(para, sentenceOffset);
    sentenceOffset += sentenceRanges.length;

    let chunkOffset = 0;

    return (
      <p key={pIdx} className="mb-4 leading-relaxed text-lg text-gray-800 dark:text-gray-200">
        {para.split(/(\s+|[.,!?;:()（）"。！？])/).map((chunk, cIdx) => {
          const start = chunkOffset;
          const end = start + chunk.length;
          chunkOffset = end;
          if (!chunk.trim() || /^[.,!?;:()（）"。！？]+$/.test(chunk)) return <span key={cIdx}>{chunk}</span>;

        const belongsToCurrentSentence = sentenceRanges.some(range =>
          range.globalIndex === currentSentenceIndex &&
          start >= range.start &&
          end <= range.end
        );
        const belongsToKeySentence = sentences.some(sentence => sentence.text.includes(chunk) && para.includes(sentence.text));
        const saved = isSavedWord(chunk);

        return (
          <span
            key={cIdx}
            onClick={(event) => onWordClick(event, chunk)}
            className={`cursor-pointer rounded px-0.5 transition-colors ${
              belongsToCurrentSentence
                ? 'bg-blue-200 dark:bg-blue-800/70 text-blue-950 dark:text-blue-50 border-b-2 border-blue-500'
                : belongsToKeySentence
                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-gray-900 dark:text-gray-100 border-b-2 border-yellow-300'
                : saved
                  ? 'bg-teal-50 dark:bg-teal-900/20 text-gray-900 dark:text-gray-100 border-b-2 border-teal-300 dark:border-teal-500 hover:bg-teal-100 dark:hover:bg-teal-900/40'
                  : 'hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-700 dark:hover:text-blue-300'
            } ${
              (belongsToKeySentence || belongsToCurrentSentence) && saved ? 'underline decoration-teal-500 decoration-2 underline-offset-4' : ''
            }`}
          >
            {chunk}
          </span>
        );
      })}
    </p>
    );
  });
};

const hasMeaningfulText = (text: string) =>
  /[a-zA-Z\u00C0-\u00FF\u0400-\u04FF\u4e00-\u9fa5\u3040-\u30ff\u3400-\u4dbf]/.test(text);

interface SentenceRange {
  start: number;
  end: number;
  globalIndex: number;
}

const getParagraphSentenceRanges = (paragraph: string, sentenceOffset: number): SentenceRange[] => {
  const ranges: SentenceRange[] = [];
  let searchFrom = 0;

  for (const rawSentence of splitTextIntoSentences(paragraph)) {
    const sentence = rawSentence.trim();
    if (!hasMeaningfulText(sentence)) continue;

    const start = paragraph.indexOf(sentence, searchFrom);
    if (start === -1) continue;

    const end = start + sentence.length;
    ranges.push({
      start,
      end,
      globalIndex: sentenceOffset + ranges.length
    });
    searchFrom = end;
  }

  return ranges;
};
