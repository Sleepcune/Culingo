import type { WordIndex, WordStatus } from '@culingo/contracts';

export function normalizeWord(text: string): string {
  return text.normalize('NFKC').replace(/\u00ad/g, '').replace(/[‘’]/g, "'").replace(/[‐‑–]/g, '-').trim().toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '').replace(/\s+/g, ' ');
}

export function lemma(text: string, index: WordIndex): string {
  const word = normalizeWord(text);
  return Object.hasOwn(index.forms, word) ? index.forms[word]! : word;
}

export function wordStatus(text: string, index: WordIndex, statuses: Record<string, WordStatus>): WordStatus | undefined {
  const surface = normalizeWord(text);
  const base = lemma(text, index);
  return Object.hasOwn(statuses, surface) ? statuses[surface] : Object.hasOwn(statuses, base) ? statuses[base] : undefined;
}

export function shouldHighlight(text: string, index: WordIndex, statuses: Record<string, WordStatus>, level: number, options: { ignore?: (surface: string) => boolean } = {}): boolean {
  const surface = normalizeWord(text);
  if (options.ignore?.(surface)) return false;
  const word = lemma(surface, index);
  const status = wordStatus(surface, index, statuses);
  if (status === 'mastered') return false;
  if (status === 'learning') return true;
  return (index.ranks[word] ?? 0) > level;
}
