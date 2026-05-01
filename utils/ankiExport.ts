import type { AnalysisResult, WordEntry } from '../types';

const preventCsvFormula = (value: string) => {
  const trimmedStart = value.trimStart();
  if (/^[=+\-@]/.test(trimmedStart)) return `'${value}`;
  return value;
};

export const escapeCsvField = (value: string): string => `"${preventCsvFormula(value).replace(/"/g, '""')}"`;

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const analysisResultToAnkiCsv = (analysisResult: AnalysisResult): string => {
  let csvContent = '';
  const addToCsv = (front: string, back: string, tag: string) => {
    csvContent += `${escapeCsvField(front)},${escapeCsvField(back)},${escapeCsvField(tag)}\n`;
  };

  analysisResult.collocations.forEach(collocation => addToCsv(collocation.text, collocation.cn, 'PolyGlot_Collocation'));
  analysisResult.vocabulary.forEach(vocab => addToCsv(vocab.text, vocab.cn, 'PolyGlot_Vocab'));
  analysisResult.sentences.forEach(sentence =>
    addToCsv(sentence.text, `${sentence.cn}\n\n[Reason: ${sentence.reason}]`, 'PolyGlot_Sentence')
  );

  return csvContent;
};

export const vocabEntryToAnkiCsvRow = (item: WordEntry): string => {
  const cleanSentence = item.contextSentence
    ? item.contextSentence.trim().replace(/^['"“]+|['"”]+$/g, '')
    : '';
  const safeWord = escapeHtml(item.word);
  const safeIpa = item.ipa ? escapeHtml(item.ipa) : '';
  const safeReading = item.reading ? escapeHtml(item.reading) : '';
  const safeSentence = cleanSentence ? escapeHtml(cleanSentence) : '';
  const safeMeaningCn = item.meaningCn ? escapeHtml(item.meaningCn) : '';
  const safeMeaningRu = item.meaningRu ? escapeHtml(item.meaningRu) : '';

  const frontHtml = `
    <div style="padding: 20px; text-align: center; font-family: system-ui, -apple-system, sans-serif;">
        <div style="font-size: 32px; font-weight: bold; margin-bottom: 10px;">${safeWord}</div>
        ${safeIpa ? `<div style="font-family: monospace; font-size: 16px; opacity: 0.6; margin-bottom: 20px;">/${safeIpa}/</div>` : ''}
        ${safeReading ? `<div style="font-size: 16px; opacity: 0.6; margin-bottom: 20px;">(${safeReading})</div>` : ''}
        ${safeSentence ? `
        <div style="font-size: 18px; line-height: 1.5; font-style: italic; opacity: 0.85; margin-top: 20px; border-top: 1px solid rgba(127,127,127,0.2); padding-top: 15px;">
            "${safeSentence}"
        </div>` : ''}
    </div>
  `.replace(/[\r\n]+/g, ' ').trim();

  const backHtml = `
    <div style="padding: 20px; text-align: left; font-family: system-ui, -apple-system, sans-serif;">
        ${safeMeaningCn ? `
        <div style="margin-bottom: 20px;">
            <div style="font-size: 12px; font-weight: bold; text-transform: uppercase; opacity: 0.5; margin-bottom: 4px;">中文释义</div>
            <div style="font-size: 18px; line-height: 1.4;">${safeMeaningCn}</div>
        </div>` : ''}

        ${safeMeaningRu ? `
        <div style="margin-bottom: 20px;">
            <div style="font-size: 12px; font-weight: bold; text-transform: uppercase; opacity: 0.5; margin-bottom: 4px;">俄语释义</div>
            <div style="font-size: 18px; line-height: 1.4;">${safeMeaningRu}</div>
        </div>` : ''}
    </div>
  `.replace(/[\r\n]+/g, ' ').trim();

  return `${escapeCsvField(frontHtml)},${escapeCsvField(backHtml)}\n`;
};

export const vocabEntriesToAnkiCsv = (entries: WordEntry[]): string =>
  entries.map(vocabEntryToAnkiCsvRow).join('');
