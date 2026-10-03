import { describe, expect, it } from 'vitest';
import { exportVocabulary, pageOrigin, siteEnabled } from '../src/ui/export';
import type { VocabularyDetail } from '../src/shared/types';

const word: VocabularyDetail = {
  id: 'one', language: 'en', kind: 'word', word: 'curious', meaning: '好奇, "求知"\n探索',
  phonetic: 'ˈkjʊəriəs', status: 'learning', createdAt: 0, updatedAt: 0,
  examples: [{ id: 'e', vocabularyId: 'one', text: 'Stay curious.\nAlways.', url: 'https://example.org/a', title: '文章', createdAt: 0 }],
};

describe('vocabulary exports', () => {
  it('escapes commas, quotes and newlines without losing Chinese text', () => {
    expect(exportVocabulary([word], 'csv')).toContain('"好奇, ""求知""\n探索"');
    expect(exportVocabulary([word], 'csv')).toContain('"Stay curious.\nAlways."');
  });
  it('neutralizes spreadsheet formulas in user-controlled cells', () => {
    expect(exportVocabulary([{ ...word, word: '=HYPERLINK("x")', meaning: '+1' }], 'csv')).toContain("'+1");
    expect(exportVocabulary([{ ...word, meaning: '@危险\t含制表符' }], 'tsv')).toContain("'@危险 含制表符");
  });
  it('uses Anki-compatible word, meaning, example, source fields in TSV', () => {
    const result = exportVocabulary([word], 'tsv');
    expect(result.split('\n')).toHaveLength(1);
    expect(result.split('\t')).toHaveLength(4);
    expect(result.startsWith('curious\t')).toBe(true);
  });
});

describe('website controls', () => {
  it('limits host permission targets to ordinary HTTP pages', () => {
    expect(pageOrigin('https://example.org:8080/path?q=1')).toBe('https://example.org:8080');
    expect(pageOrigin('chrome://extensions')).toBeNull();
    expect(pageOrigin('file:///C:/secret.txt')).toBeNull();
    expect(pageOrigin('invalid')).toBeNull();
  });
  it('honors explicit per-site exclusions under all-sites mode', () => {
    expect(siteEnabled('https://example.org', true, { 'https://example.org': false })).toBe(false);
    expect(siteEnabled('https://example.org', true, {})).toBe(true);
    expect(siteEnabled('https://example.org', false, { 'https://example.org': true })).toBe(true);
    expect(siteEnabled('https://example.org', false, {})).toBe(false);
  });
});
