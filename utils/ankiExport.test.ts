import { describe, expect, it } from 'vitest';
import type { AnalysisResult, WordEntry } from '../types';
import {
  analysisResultToAnkiCsv,
  escapeCsvField,
  escapeHtml,
  vocabEntriesToAnkiCsv
} from './ankiExport';

describe('Anki CSV export helpers', () => {
  it('escapes CSV quotes and prevents spreadsheet formulas', () => {
    expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""');
    expect(escapeCsvField('=IMPORTXML("https://example.com")')).toBe('"\'=IMPORTXML(""https://example.com"")"');
  });

  it('escapes HTML in vocabulary cards before writing CSV', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('exports analysis rows with stable tags and escaped newlines', () => {
    const analysis: AnalysisResult = {
      collocations: [{ text: 'take "off"', cn: '起飞' }],
      vocabulary: [{ text: '+danger', cn: '危险' }],
      sentences: [{ text: 'I agree.', cn: '我同意。', reason: 'useful pattern' }]
    };

    expect(analysisResultToAnkiCsv(analysis)).toBe(
      '"take ""off""","起飞","PolyGlot_Collocation"\n' +
        '"\'+danger","危险","PolyGlot_Vocab"\n' +
        '"I agree.","我同意。\n\n[Reason: useful pattern]","PolyGlot_Sentence"\n'
    );
  });

  it('exports vocabulary cards without allowing raw HTML injection', () => {
    const entry: WordEntry = {
      id: 'word-1',
      word: '<b>hello</b>',
      ipa: 'həˈloʊ',
      meaningCn: '你好 & 问候',
      meaningRu: '"привет"',
      timestamp: 1
    };

    const csv = vocabEntriesToAnkiCsv([entry]);

    expect(csv).toContain('&lt;b&gt;hello&lt;/b&gt;');
    expect(csv).toContain('你好 &amp; 问候');
    expect(csv).toContain('&quot;привет&quot;');
    expect(csv).not.toContain('<b>hello</b>');
  });
});
