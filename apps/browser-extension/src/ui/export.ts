import type { VocabularyDetail } from '../shared/types';

export function exportVocabulary(items: VocabularyDetail[], format: 'csv' | 'tsv'): string {
  const safe = (value: string) => /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
  const rows = items.map(item => [item.word, item.meaning, item.examples.map(e => e.text).join('\n'), item.examples.map(e => e.url).join('\n')]);
  if (format === 'tsv') return rows.map(row => row.map(value => safe(value).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
  const csvCell = (value: string) => {
    const text = safe(value);
    return /[,"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [['word', 'meaning', 'example', 'url'], ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function pageOrigin(url?: string): string | null {
  try {
    const parsed = new URL(url ?? '');
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : null;
  } catch { return null; }
}

export function siteEnabled(origin: string, allSites: boolean, sites: Record<string, boolean>): boolean {
  return sites[origin] ?? allSites;
}
