import type { WordIndex, WordStatus } from '../types';
export function normalizeWord(text: string): string {
  return text.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[‐‑–]/g, '-').trim().toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '').replace(/\s+/g, ' ');
}
export function lemma(text: string, index: WordIndex): string {
  const word = normalizeWord(text);
  return Object.hasOwn(index.forms, word) ? index.forms[word]! : word;
}
export function shouldHighlight(text: string, index: WordIndex, statuses: Record<string, WordStatus>, level: number): boolean {
  const word = lemma(text, index);
  const status=wordStatus(text,index,statuses);
  if (status === 'mastered') return false;
  // Single-letter PDF tokens are usually mathematical variables. Keep the
  // ordinary one-letter English words available for learning.
  const surface=normalizeWord(text);
  if (surface.length===1&&!/^[ai]$/.test(surface)) return false;
  if (status === 'learning') return true;
  const rank = index.ranks[word] ?? 0;
  return rank > level;
}
export function wordStatus(text:string,index:WordIndex,statuses:Record<string,WordStatus>):WordStatus|undefined {
  const surface=normalizeWord(text);const base=lemma(text,index);
  return Object.hasOwn(statuses,surface)?statuses[surface]:Object.hasOwn(statuses,base)?statuses[base]:undefined;
}
